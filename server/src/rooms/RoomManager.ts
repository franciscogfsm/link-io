// ============================================================
// LINK.IO Server - Room Manager
// Matchmaking, lobby creation, 2v2 queue, and room lifecycle
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, LobbyInfo, GameMode } from '../../../shared/types.js';
import { GameRoom } from '../game/GameRoom.js';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

interface LobbyPlayer {
  socket: Socket<ClientToServerEvents, ServerToClientEvents>;
  name: string;
  team: number;  // 1 or 2
  ready: boolean;
}

interface Lobby {
  code: string;
  gameMode: GameMode;
  hostId: string;
  players: Map<string, LobbyPlayer>;
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'in-game';
  countdownTimer: ReturnType<typeof setTimeout> | null;
}

interface QueueEntry {
  socket: Socket<ClientToServerEvents, ServerToClientEvents>;
  name: string;
  joinedAt: number;
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  private playerRooms = new Map<string, string>(); // socketId -> roomId
  private lobbies = new Map<string, Lobby>();       // code -> lobby
  private playerLobbies = new Map<string, string>(); // socketId -> lobbyCode
  private teamsQueue: QueueEntry[] = [];            // queue for 2v2 matchmaking
  private io: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
  }

  handleConnection(socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
    socket.on('player:join', (data) => {
      if (data.roomCode) {
        // Try lobby first, then room
        const lobby = this.lobbies.get(data.roomCode.toUpperCase());
        if (lobby) {
          this.joinLobby(socket, data.name, data.roomCode.toUpperCase());
        } else {
          this.joinByCode(socket, data.name, data.roomCode);
        }
      } else if (data.gameMode === 'teams') {
        this.joinTeamsQueue(socket, data.name);
      } else {
        this.quickPlay(socket, data.name);
      }
    });

    socket.on('player:createRoom', (data) => {
      this.createLobby(socket, data.name, data.gameMode || 'ffa');
    });

    // Lobby controls
    socket.on('lobby:setTeam', (data) => {
      this.setLobbyTeam(socket.id, data.team);
    });

    socket.on('lobby:toggleReady', () => {
      this.toggleLobbyReady(socket.id);
    });

    socket.on('lobby:startGame', () => {
      this.startLobbyGame(socket.id);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket.id);
    });
  }

  // ─── FFA Quick Play ────────────────────────────────────
  private quickPlay(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string): void {
    let room: GameRoom | undefined;
    for (const [, r] of this.rooms) {
      if (!r.isFull && r.gamePhase === 'waiting') {
        room = r;
        break;
      }
    }

    if (!room) {
      const code = this.generateUniqueCode();
      room = new GameRoom(this.io, code, 'ffa');
      this.rooms.set(room.id, room);
    }

    this.joinRoom(socket, room, name);
  }

  // ─── 2v2 Teams Queue ──────────────────────────────────
  private joinTeamsQueue(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string): void {
    // Remove from queue if already in it
    this.teamsQueue = this.teamsQueue.filter(e => e.socket.id !== socket.id);

    this.teamsQueue.push({ socket, name, joinedAt: Date.now() });

    const position = this.teamsQueue.length;
    const playersNeeded = 4 - ((this.teamsQueue.length % 4) || 4);

    socket.emit('queue:status', {
      position,
      playersNeeded: playersNeeded === 4 ? 0 : playersNeeded,
      message: this.teamsQueue.length >= 4
        ? 'Match found! Starting...'
        : `Waiting for ${4 - this.teamsQueue.length} more player(s)...`,
    });

    // Try to form a 4-player match
    if (this.teamsQueue.length >= 4) {
      const matchPlayers = this.teamsQueue.splice(0, 4);
      this.createTeamsMatch(matchPlayers);
    }

    // Notify remaining queue
    for (let i = 0; i < this.teamsQueue.length; i++) {
      const entry = this.teamsQueue[i];
      entry.socket.emit('queue:status', {
        position: i + 1,
        playersNeeded: 4 - this.teamsQueue.length,
        message: `Waiting for ${4 - this.teamsQueue.length} more player(s)... (Position: ${i + 1})`,
      });
    }
  }

  private createTeamsMatch(players: QueueEntry[]): void {
    const code = this.generateUniqueCode();
    const room = new GameRoom(this.io, code, 'teams');
    this.rooms.set(room.id, room);

    // Add all 4 players: first 2 get team 1, next 2 get team 2
    for (let i = 0; i < players.length; i++) {
      const entry = players[i];
      const team = i < 2 ? 1 : 2;
      this.joinRoom(entry.socket, room, entry.name, team);
    }

    console.log(`[LINK.IO] 2v2 Match created! Room ${code} with ${players.map(p => p.name).join(', ')}`);
  }

  // ─── Lobby System ─────────────────────────────────────
  private createLobby(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string, gameMode: GameMode): void {
    // Leave existing lobby if any
    this.leaveLobby(socket.id);

    const code = this.generateUniqueCode();
    const maxPlayers = gameMode === 'teams' ? 4 : 8;

    const lobby: Lobby = {
      code,
      gameMode,
      hostId: socket.id,
      players: new Map(),
      maxPlayers,
      status: 'waiting',
      countdownTimer: null,
    };

    lobby.players.set(socket.id, {
      socket,
      name,
      team: gameMode === 'teams' ? 1 : 0,
      ready: false,
    });

    this.lobbies.set(code, lobby);
    this.playerLobbies.set(socket.id, code);

    // Emit room:joined so the client gets the room code
    socket.emit('room:joined', {
      roomId: code,
      roomCode: code,
      playerId: socket.id,
    });

    this.broadcastLobbyUpdate(lobby);
    console.log(`[LINK.IO] Lobby created: ${code} (${gameMode}) by ${name}`);
  }

  private joinLobby(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string, code: string): void {
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      socket.emit('room:error', { message: 'Lobby not found.' });
      return;
    }

    if (lobby.status !== 'waiting') {
      socket.emit('room:error', { message: 'Game already in progress.' });
      return;
    }

    if (lobby.players.size >= lobby.maxPlayers) {
      socket.emit('room:error', { message: 'Lobby is full.' });
      return;
    }

    // Auto-assign team for teams mode (balance teams)
    let team = 0;
    if (lobby.gameMode === 'teams') {
      let team1Count = 0, team2Count = 0;
      for (const [, p] of lobby.players) {
        if (p.team === 1) team1Count++;
        if (p.team === 2) team2Count++;
      }
      team = team1Count <= team2Count ? 1 : 2;
    }

    this.leaveLobby(socket.id);
    lobby.players.set(socket.id, { socket, name, team, ready: false });
    this.playerLobbies.set(socket.id, code);

    socket.emit('room:joined', {
      roomId: code,
      roomCode: code,
      playerId: socket.id,
    });

    this.broadcastLobbyUpdate(lobby);
    console.log(`[LINK.IO] ${name} joined lobby ${code}`);
  }

  private setLobbyTeam(socketId: string, team: number): void {
    const code = this.playerLobbies.get(socketId);
    if (!code) return;
    const lobby = this.lobbies.get(code);
    if (!lobby || lobby.gameMode !== 'teams') return;

    const player = lobby.players.get(socketId);
    if (!player) return;

    // Check team has space (max 2 per team in 2v2)
    let teamCount = 0;
    for (const [, p] of lobby.players) {
      if (p.team === team) teamCount++;
    }
    if (teamCount >= 2) return; // team full

    player.team = team;
    this.broadcastLobbyUpdate(lobby);
  }

  private toggleLobbyReady(socketId: string): void {
    const code = this.playerLobbies.get(socketId);
    if (!code) return;
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    const player = lobby.players.get(socketId);
    if (!player) return;

    player.ready = !player.ready;
    this.broadcastLobbyUpdate(lobby);

    // Auto-start check: all ready + enough players
    this.checkLobbyAutoStart(lobby);
  }

  private startLobbyGame(socketId: string): void {
    const code = this.playerLobbies.get(socketId);
    if (!code) return;
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    // Only host can start
    if (lobby.hostId !== socketId) return;

    // Need min players
    const minPlayers = lobby.gameMode === 'teams' ? 4 : 2;
    if (lobby.players.size < minPlayers) {
      const hostPlayer = lobby.players.get(socketId);
      hostPlayer?.socket.emit('room:error', {
        message: `Need at least ${minPlayers} players to start.`,
      });
      return;
    }

    this.launchLobbyGame(lobby);
  }

  private checkLobbyAutoStart(lobby: Lobby): void {
    if (lobby.status !== 'waiting') return;

    const allReady = [...lobby.players.values()].every(p => p.ready);
    const minPlayers = lobby.gameMode === 'teams' ? 4 : 2;

    if (allReady && lobby.players.size >= minPlayers) {
      lobby.status = 'starting';

      // 3-second countdown
      let countdown = 3;
      for (const [, p] of lobby.players) {
        p.socket.emit('lobby:countdown', { seconds: countdown });
      }

      lobby.countdownTimer = setInterval(() => {
        countdown--;
        for (const [, p] of lobby.players) {
          p.socket.emit('lobby:countdown', { seconds: countdown });
        }
        if (countdown <= 0) {
          if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
          lobby.countdownTimer = null;
          this.launchLobbyGame(lobby);
        }
      }, 1000);
    }
  }

  private launchLobbyGame(lobby: Lobby): void {
    if (lobby.status === 'in-game') return;
    lobby.status = 'in-game';

    if (lobby.countdownTimer) {
      clearInterval(lobby.countdownTimer);
      lobby.countdownTimer = null;
    }

    const roomCode = this.generateUniqueCode();
    const room = new GameRoom(this.io, roomCode, lobby.gameMode);
    this.rooms.set(room.id, room);

    // Add players with their selected teams
    for (const [socketId, lp] of lobby.players) {
      this.joinRoom(lp.socket, room, lp.name, lp.team);

      // Clean up lobby references
      this.playerLobbies.delete(socketId);
    }

    // Clean up lobby
    this.lobbies.delete(lobby.code);

    console.log(`[LINK.IO] Lobby ${lobby.code} launched game in room ${roomCode}`);
  }

  private leaveLobby(socketId: string): void {
    const code = this.playerLobbies.get(socketId);
    if (!code) return;

    const lobby = this.lobbies.get(code);
    if (!lobby) {
      this.playerLobbies.delete(socketId);
      return;
    }

    lobby.players.delete(socketId);
    this.playerLobbies.delete(socketId);

    if (lobby.players.size === 0) {
      if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
      this.lobbies.delete(code);
      return;
    }

    // If host left, assign new host
    if (lobby.hostId === socketId) {
      const firstPlayer = lobby.players.keys().next().value;
      if (firstPlayer) lobby.hostId = firstPlayer;
    }

    // Cancel countdown if someone leaves
    if (lobby.status === 'starting') {
      lobby.status = 'waiting';
      if (lobby.countdownTimer) {
        clearInterval(lobby.countdownTimer);
        lobby.countdownTimer = null;
      }
    }

    this.broadcastLobbyUpdate(lobby);
  }

  private broadcastLobbyUpdate(lobby: Lobby): void {
    const hostPlayer = lobby.players.get(lobby.hostId);
    const info: LobbyInfo = {
      code: lobby.code,
      gameMode: lobby.gameMode,
      hostName: hostPlayer?.name || 'Unknown',
      players: [...lobby.players.entries()].map(([id, p]) => ({
        id,
        name: p.name,
        team: p.team,
        ready: p.ready,
      })),
      maxPlayers: lobby.maxPlayers,
      status: lobby.status,
    };

    for (const [, p] of lobby.players) {
      p.socket.emit('lobby:update', info);
    }
  }

  // ─── Room Management ──────────────────────────────────
  private joinByCode(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string, code: string): void {
    const room = this.findRoomByCode(code.toUpperCase());

    if (!room) {
      // Try as lobby
      const lobby = this.lobbies.get(code.toUpperCase());
      if (lobby) {
        this.joinLobby(socket, name, code.toUpperCase());
        return;
      }
      socket.emit('room:error', { message: 'Room not found. Check the code and try again.' });
      return;
    }

    if (room.isFull) {
      socket.emit('room:error', { message: 'Room is full.' });
      return;
    }

    this.joinRoom(socket, room, name);
  }

  private joinRoom(socket: Socket<ClientToServerEvents, ServerToClientEvents>, room: GameRoom, name: string, forcedTeam?: number): void {
    // Leave existing room if any
    const existingRoomId = this.playerRooms.get(socket.id);
    if (existingRoomId) {
      const existingRoom = this.rooms.get(existingRoomId);
      if (existingRoom) {
        existingRoom.removePlayer(socket.id);
      }
    }

    const player = room.addPlayer(socket, name, forcedTeam);
    if (!player) {
      socket.emit('room:error', { message: 'Could not join room.' });
      return;
    }

    this.playerRooms.set(socket.id, room.id);

    socket.emit('room:joined', {
      roomId: room.id,
      roomCode: room.code,
      playerId: socket.id,
    });
  }

  private handleDisconnect(socketId: string): void {
    // Remove from teams queue
    this.teamsQueue = this.teamsQueue.filter(e => e.socket.id !== socketId);

    // Remove from lobby
    this.leaveLobby(socketId);

    // Remove from room
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.removePlayer(socketId);

      if (room.isEmpty()) {
        room.destroy();
        this.rooms.delete(roomId);
      }
    }

    this.playerRooms.delete(socketId);
  }

  private findRoomByCode(code: string): GameRoom | undefined {
    for (const [, room] of this.rooms) {
      if (room.code === code) return room;
    }
    return undefined;
  }

  private generateUniqueCode(): string {
    let code: string;
    let attempts = 0;
    do {
      code = generateRoomCode();
      attempts++;
    } while ((this.findRoomByCode(code) || this.lobbies.has(code)) && attempts < 100);
    return code;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getPlayerCount(): number {
    return this.playerRooms.size + this.teamsQueue.length;
  }
}
