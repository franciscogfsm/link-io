// ============================================================
// LINK.IO Server - Game Room
// Core game loop and state management
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { Server, Socket } from 'socket.io';
import type { GameState, GameNode, GameLink, Player, ClientToServerEvents, ServerToClientEvents } from '../../../shared/types.js';
import { PhysicsEngine } from './PhysicsEngine.js';
import { NetworkManager } from './NetworkManager.js';
import { NodeGenerator } from './NodeGenerator.js';
import { AntiCheat } from './AntiCheat.js';

const ARENA_WIDTH = 3500;
const ARENA_HEIGHT = 2500;
const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;
const GAME_DURATION = 180; // 3 minutes
const INITIAL_ENERGY = 100;
const MAX_PLAYERS = 8;
const MIN_PLAYERS_TO_START = 2;
const NEUTRAL_NODE_COUNT = 80; // more nodes = more territory to fight over

const PLAYER_COLORS = [
  '#00f0ff', '#ff006e', '#39ff14', '#ffbe0b',
  '#8338ec', '#ff5400', '#00b4d8', '#e5383b',
];

export class GameRoom {
  id: string;
  code: string;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private state: GameState;
  private physics: PhysicsEngine;
  private network: NetworkManager;
  private nodeGen: NodeGenerator;
  private antiCheat: AntiCheat;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTick: number = Date.now();
  private sockets = new Map<string, Socket<ClientToServerEvents, ServerToClientEvents>>();
  private startTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>, code: string) {
    this.id = uuidv4();
    this.code = code;
    this.io = io;
    this.physics = new PhysicsEngine(ARENA_WIDTH, ARENA_HEIGHT);
    this.network = new NetworkManager();
    this.nodeGen = new NodeGenerator(ARENA_WIDTH, ARENA_HEIGHT);
    this.antiCheat = new AntiCheat();

    // Generate neutral nodes
    const neutralNodes = this.nodeGen.generateInitialNodes(NEUTRAL_NODE_COUNT);

    this.state = {
      nodes: neutralNodes,
      links: [],
      players: [],
      timeRemaining: GAME_DURATION,
      gamePhase: 'waiting',
      winner: null,
      arenaWidth: ARENA_WIDTH,
      arenaHeight: ARENA_HEIGHT,
    };
  }

  get playerCount(): number {
    return this.state.players.length;
  }

  get maxPlayers(): number {
    return MAX_PLAYERS;
  }

  get gamePhase(): string {
    return this.state.gamePhase;
  }

  get isFull(): boolean {
    return this.state.players.length >= MAX_PLAYERS;
  }

  addPlayer(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string): Player | null {
    if (this.isFull || this.state.gamePhase === 'ended') return null;

    const colorIndex = this.state.players.length % PLAYER_COLORS.length;
    
    // Spawn core node at spread position
    const spawnPos = this.nodeGen.getSpawnPosition(this.state.nodes);
    const coreNode = this.nodeGen.createNode(spawnPos, true, socket.id);
    this.state.nodes.push(coreNode);

    const player: Player = {
      id: socket.id,
      name: name || `Player ${this.state.players.length + 1}`,
      color: PLAYER_COLORS[colorIndex],
      energy: INITIAL_ENERGY,
      coreNodeId: coreNode.id,
      nodeCount: 1,
      linkCount: 0,
      alive: true,
    };

    this.state.players.push(player);
    this.sockets.set(socket.id, socket);

    // Bind socket events
    this.bindPlayerEvents(socket, player);

    // Notify room
    socket.join(this.id);
    this.io.to(this.id).emit('room:playerJoined', { player });

    // Auto-start after delay when enough players
    if (this.state.players.length >= MIN_PLAYERS_TO_START && this.state.gamePhase === 'waiting') {
      if (this.startTimeout) clearTimeout(this.startTimeout);
      this.startTimeout = setTimeout(() => this.startGame(), 3000);
    }

    return player;
  }

  removePlayer(socketId: string): void {
    const playerIndex = this.state.players.findIndex((p) => p.id === socketId);
    if (playerIndex === -1) return;

    const player = this.state.players[playerIndex];

    // Remove player's nodes and links
    this.state.links = this.state.links.filter((l) => l.owner !== socketId);
    for (const node of this.state.nodes) {
      if (node.owner === socketId) {
        node.owner = null;
        node.energy = 0;
      }
    }
    // Remove core nodes
    this.state.nodes = this.state.nodes.filter(
      (n) => !(n.isCore && n.owner === null && n.id === player.coreNodeId)
    );

    this.state.players.splice(playerIndex, 1);
    this.sockets.delete(socketId);
    this.antiCheat.cleanup(socketId);

    this.io.to(this.id).emit('room:playerLeft', { playerId: socketId });

    // Check if game should end
    if (this.state.gamePhase === 'playing') {
      const alivePlayers = this.state.players.filter((p) => p.alive);
      if (alivePlayers.length <= 1) {
        this.endGame();
      }
    }

    // Cancel start if not enough players
    if (this.state.players.length < MIN_PLAYERS_TO_START && this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
  }

  private bindPlayerEvents(socket: Socket<ClientToServerEvents, ServerToClientEvents>, player: Player): void {
    socket.on('game:createLink', (data) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) {
        console.log('[LINK.IO] Link rejected: game not playing or player dead', { phase: this.state.gamePhase, alive: player.alive });
        return;
      }

      console.log(`[LINK.IO] ${player.name} attempting link: ${data.fromNodeId} -> ${data.toNodeId}`);

      const validation = this.antiCheat.validateLinkCreation(
        player.id,
        data.fromNodeId,
        data.toNodeId,
        this.state.nodes,
        this.state.links,
        player
      );

      if (!validation.valid) {
        console.log(`[LINK.IO] Link validation failed: ${validation.reason}`);
        socket.emit('game:error', { message: validation.reason || 'Invalid action' });
        return;
      }

      const link = this.network.createLink(
        data.fromNodeId,
        data.toNodeId,
        player.id,
        this.state.nodes,
        this.state.links,
        player
      );

      if (link) {
        this.state.links.push(link);
        console.log(`[LINK.IO] ✅ ${player.name} created link! Total links: ${this.state.links.length}`);
        this.io.to(this.id).emit('game:linkCreated', link);

        // Update claimed nodes
        const toNode = this.state.nodes.find((n) => n.id === data.toNodeId);
        if (toNode && toNode.owner === player.id) {
          this.io.to(this.id).emit('game:nodesClaimed', {
            nodeIds: [data.toNodeId],
            owner: player.id,
          });
        }
      } else {
        console.log(`[LINK.IO] ❌ Link creation returned null for ${player.name}`);
        socket.emit('game:error', { message: 'Cannot create that link. Check distance/energy.' });
      }
    });

    socket.on('game:destroyLink', (data) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;

      const result = this.network.destroyLink(
        data.linkId,
        player.id,
        this.state.links,
        this.state.nodes
      );

      if (result.success) {
        this.io.to(this.id).emit('game:linkDestroyed', {
          linkId: data.linkId,
          reason: 'player_action',
        });

        if (result.disconnectedNodes.length > 0) {
          this.io.to(this.id).emit('game:networkCollapsed', {
            nodeIds: result.disconnectedNodes,
            playerId: player.id,
          });
          this.io.to(this.id).emit('game:nodesClaimed', {
            nodeIds: result.disconnectedNodes,
            owner: null,
          });
        }
      }
    });

    socket.on('game:claimNode', (data) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;
      // Claiming is handled through link creation
    });
  }

  private startGame(): void {
    if (this.state.gamePhase !== 'waiting') return;

    this.state.gamePhase = 'playing';
    this.state.timeRemaining = GAME_DURATION;
    this.lastTick = Date.now();

    console.log(`\n[LINK.IO] 🎮 GAME STARTED! Room ${this.code} with ${this.state.players.length} players`);
    console.log(`[LINK.IO] Players: ${this.state.players.map(p => p.name).join(', ')}`);
    console.log(`[LINK.IO] Arena: ${ARENA_WIDTH}x${ARENA_HEIGHT}, Nodes: ${this.state.nodes.length}\n`);

    this.io.to(this.id).emit('game:started', this.state);

    // Start game loop
    this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  private tick(): void {
    const now = Date.now();
    const deltaTime = (now - this.lastTick) / 1000;
    this.lastTick = now;

    if (this.state.gamePhase !== 'playing') return;

    // Update timer
    this.state.timeRemaining -= deltaTime;
    if (this.state.timeRemaining <= 0) {
      this.state.timeRemaining = 0;
      this.endGame();
      return;
    }

    // Physics
    this.physics.update(this.state.nodes, deltaTime);

    // Energy generation and flow
    this.network.updateEnergy(
      this.state.nodes,
      this.state.links,
      this.state.players,
      deltaTime
    );

    // Combat
    const combatResult = this.network.handleCombat(
      this.state.links,
      this.state.nodes,
      deltaTime
    );

    // Broadcast combat events
    for (const linkId of combatResult.destroyedLinks) {
      this.io.to(this.id).emit('game:linkDestroyed', {
        linkId,
        reason: 'combat',
      });
    }

    for (const [playerId, nodeIds] of combatResult.collapsedNodes) {
      this.io.to(this.id).emit('game:networkCollapsed', { nodeIds, playerId });
      this.io.to(this.id).emit('game:nodesClaimed', { nodeIds, owner: null });
    }

    // Check for eliminated players
    for (const player of this.state.players) {
      if (!player.alive) continue;
      const coreNode = this.state.nodes.find(
        (n) => n.id === player.coreNodeId && n.owner === player.id
      );
      if (!coreNode) {
        player.alive = false;
      }
    }

    // Check win condition
    const alivePlayers = this.state.players.filter((p) => p.alive);
    if (alivePlayers.length <= 1) {
      this.endGame();
      return;
    }

    // Broadcast state
    this.io.to(this.id).emit('game:state', this.state);
  }

  private endGame(): void {
    this.state.gamePhase = 'ended';

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Determine winner
    const sortedPlayers = [...this.state.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.energy - a.energy;
    });

    const winner = sortedPlayers[0] || null;
    this.state.winner = winner?.id || null;

    this.io.to(this.id).emit('game:ended', {
      winner,
      scores: sortedPlayers,
    });

    // Broadcast final state
    this.io.to(this.id).emit('game:state', this.state);
  }

  isEmpty(): boolean {
    return this.state.players.length === 0;
  }

  destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
  }
}
