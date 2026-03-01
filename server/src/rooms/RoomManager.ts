// ============================================================
// LINK.IO Server - Room Manager
// Matchmaking, lobby creation, and room lifecycle
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, RoomInfo } from '../../../shared/types.js';
import { GameRoom } from '../game/GameRoom.js';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  private playerRooms = new Map<string, string>(); // socketId -> roomId
  private io: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
  }

  handleConnection(socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
    socket.on('player:join', (data) => {
      if (data.roomCode) {
        this.joinByCode(socket, data.name, data.roomCode);
      } else {
        this.quickPlay(socket, data.name);
      }
    });

    socket.on('player:createRoom', (data) => {
      this.createRoom(socket, data.name);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket.id);
    });
  }

  private quickPlay(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string): void {
    // Find a room with space that's still waiting
    let room: GameRoom | undefined;
    for (const [, r] of this.rooms) {
      if (!r.isFull && r.gamePhase === 'waiting') {
        room = r;
        break;
      }
    }

    // Create new room if none available
    if (!room) {
      const code = this.generateUniqueCode();
      room = new GameRoom(this.io, code);
      this.rooms.set(room.id, room);
    }

    this.joinRoom(socket, room, name);
  }

  private createRoom(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string): void {
    const code = this.generateUniqueCode();
    const room = new GameRoom(this.io, code);
    this.rooms.set(room.id, room);
    this.joinRoom(socket, room, name);
  }

  private joinByCode(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string, code: string): void {
    const room = this.findRoomByCode(code.toUpperCase());

    if (!room) {
      socket.emit('room:error', { message: 'Room not found. Check the code and try again.' });
      return;
    }

    if (room.isFull) {
      socket.emit('room:error', { message: 'Room is full.' });
      return;
    }

    this.joinRoom(socket, room, name);
  }

  private joinRoom(socket: Socket<ClientToServerEvents, ServerToClientEvents>, room: GameRoom, name: string): void {
    // Leave existing room if any
    const existingRoomId = this.playerRooms.get(socket.id);
    if (existingRoomId) {
      const existingRoom = this.rooms.get(existingRoomId);
      if (existingRoom) {
        existingRoom.removePlayer(socket.id);
      }
    }

    const player = room.addPlayer(socket, name);
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
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.removePlayer(socketId);

      // Clean up empty rooms
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
    } while (this.findRoomByCode(code) && attempts < 100);
    return code;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getPlayerCount(): number {
    return this.playerRooms.size;
  }
}
