// ============================================================
// LINK.IO Server - Game Room
// Core game loop with abilities, combos, kill feed
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { Server, Socket } from 'socket.io';
import type {
  GameState, GameNode, GameLink, Player,
  ClientToServerEvents, ServerToClientEvents,
  KillFeedEntry, AbilityType
} from '../../../shared/types.js';
import { PhysicsEngine } from './PhysicsEngine.js';
import { NetworkManager } from './NetworkManager.js';
import { NodeGenerator } from './NodeGenerator.js';
import { AntiCheat } from './AntiCheat.js';

const ARENA_WIDTH = 3500;
const ARENA_HEIGHT = 2500;
const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;
const GAME_DURATION = 180;
const INITIAL_ENERGY = 100;
const MAX_PLAYERS = 8;
const MIN_PLAYERS_TO_START = 2;
const NEUTRAL_NODE_COUNT = 80;
const COMBO_WINDOW = 3; // seconds to chain links
const COMBO_BONUS_BASE = 5; // energy per combo level

const ABILITY_COSTS: Record<AbilityType, number> = {
  surge: 40,
  shield: 30,
  emp: 60,
};

const ABILITY_COOLDOWNS: Record<AbilityType, number> = {
  surge: 12,
  shield: 15,
  emp: 20,
};

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

    const neutralNodes = this.nodeGen.generateInitialNodes(NEUTRAL_NODE_COUNT);

    this.state = {
      nodes: neutralNodes,
      links: [],
      players: [],
      killFeed: [],
      timeRemaining: GAME_DURATION,
      gamePhase: 'waiting',
      winner: null,
      arenaWidth: ARENA_WIDTH,
      arenaHeight: ARENA_HEIGHT,
    };
  }

  get playerCount(): number { return this.state.players.length; }
  get maxPlayers(): number { return MAX_PLAYERS; }
  get gamePhase(): string { return this.state.gamePhase; }
  get isFull(): boolean { return this.state.players.length >= MAX_PLAYERS; }

  addPlayer(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string): Player | null {
    if (this.isFull || this.state.gamePhase === 'ended') return null;

    const colorIndex = this.state.players.length % PLAYER_COLORS.length;
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
      score: 0,
      killCount: 0,
      combo: 0,
      comboTimer: 0,
      abilityCooldowns: { surge: 0, shield: 0, emp: 0 },
    };

    this.state.players.push(player);
    this.sockets.set(socket.id, socket);
    this.bindPlayerEvents(socket, player);

    socket.join(this.id);
    this.io.to(this.id).emit('room:playerJoined', { player });

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

    this.state.links = this.state.links.filter((l) => l.owner !== socketId);
    for (const node of this.state.nodes) {
      if (node.owner === socketId) {
        node.owner = null;
        node.energy = 0;
      }
    }
    this.state.nodes = this.state.nodes.filter(
      (n) => !(n.isCore && n.owner === null && n.id === player.coreNodeId)
    );

    this.state.players.splice(playerIndex, 1);
    this.sockets.delete(socketId);
    this.antiCheat.cleanup(socketId);
    this.io.to(this.id).emit('room:playerLeft', { playerId: socketId });

    if (this.state.gamePhase === 'playing') {
      const alivePlayers = this.state.players.filter((p) => p.alive);
      if (alivePlayers.length <= 1) this.endGame();
    }

    if (this.state.players.length < MIN_PLAYERS_TO_START && this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
  }

  private addKillFeed(killer: Player, victim: Player, action: string): void {
    const entry: KillFeedEntry = {
      id: uuidv4(),
      killer: killer.name,
      killerColor: killer.color,
      victim: victim.name,
      victimColor: victim.color,
      action,
      timestamp: Date.now(),
    };
    this.state.killFeed.push(entry);
    // Keep only last 8 entries
    if (this.state.killFeed.length > 8) {
      this.state.killFeed = this.state.killFeed.slice(-8);
    }
    this.io.to(this.id).emit('game:killFeed', entry);
  }

  private handleCombo(player: Player): void {
    player.combo++;
    player.comboTimer = COMBO_WINDOW;

    if (player.combo >= 2) {
      const bonusEnergy = player.combo * COMBO_BONUS_BASE;
      player.energy += bonusEnergy;
      player.score += player.combo * 10;

      this.io.to(this.id).emit('game:combo', {
        playerId: player.id,
        combo: player.combo,
        bonusEnergy,
      });

      console.log(`[LINK.IO] 🔥 ${player.name} COMBO x${player.combo}! +${bonusEnergy} energy`);
    }
  }

  private handleAbility(player: Player, ability: AbilityType): void {
    // Check cooldown
    if (player.abilityCooldowns[ability] > 0) {
      const socket = this.sockets.get(player.id);
      socket?.emit('game:error', {
        message: `${ability.toUpperCase()} on cooldown (${Math.ceil(player.abilityCooldowns[ability])}s)`,
      });
      return;
    }

    // Check energy cost
    const cost = ABILITY_COSTS[ability];
    if (player.energy < cost) {
      const socket = this.sockets.get(player.id);
      socket?.emit('game:error', { message: `Need ${cost} energy for ${ability.toUpperCase()}!` });
      return;
    }

    player.energy -= cost;
    player.abilityCooldowns[ability] = ABILITY_COOLDOWNS[ability];

    const targetNodes: string[] = [];

    switch (ability) {
      case 'surge': {
        // Damage all enemy links connected to your nodes
        const ownedNodeIds = new Set(
          this.state.nodes.filter((n) => n.owner === player.id).map((n) => n.id)
        );
        for (const link of this.state.links) {
          if (link.owner !== player.id) {
            const touches = ownedNodeIds.has(link.fromNodeId) || ownedNodeIds.has(link.toNodeId);
            if (touches) {
              link.health -= 35;
              targetNodes.push(link.fromNodeId, link.toNodeId);
            }
          }
        }
        // Screen shake for everyone
        this.io.to(this.id).emit('game:screenShake', { intensity: 8, duration: 0.4 });
        console.log(`[LINK.IO] ⚡ ${player.name} used SURGE! Hit ${targetNodes.length / 2} enemy links`);
        break;
      }

      case 'shield': {
        // Shield all your links for 5 seconds
        for (const link of this.state.links) {
          if (link.owner === player.id) {
            link.shielded = true;
            targetNodes.push(link.fromNodeId);
          }
        }
        // Remove shields after 5 seconds
        setTimeout(() => {
          for (const link of this.state.links) {
            if (link.owner === player.id) {
              link.shielded = false;
            }
          }
        }, 5000);
        console.log(`[LINK.IO] 🛡️ ${player.name} activated SHIELD!`);
        break;
      }

      case 'emp': {
        // Find the closest enemy core and damage all links in a radius around it
        const coreNode = this.state.nodes.find(
          (n) => n.id === player.coreNodeId && n.owner === player.id
        );
        if (!coreNode) break;

        const empRadius = 500;
        for (const link of this.state.links) {
          if (link.owner === player.id) continue;
          const fromNode = this.state.nodes.find((n) => n.id === link.fromNodeId);
          const toNode = this.state.nodes.find((n) => n.id === link.toNodeId);
          if (!fromNode || !toNode) continue;

          const midX = (fromNode.position.x + toNode.position.x) / 2;
          const midY = (fromNode.position.y + toNode.position.y) / 2;
          const dx = midX - coreNode.position.x;
          const dy = midY - coreNode.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < empRadius) {
            link.health -= 50;
            targetNodes.push(link.fromNodeId, link.toNodeId);
          }
        }
        this.io.to(this.id).emit('game:screenShake', { intensity: 15, duration: 0.6 });
        console.log(`[LINK.IO] 💣 ${player.name} used EMP! Range ${empRadius}, hit ${targetNodes.length / 2} links`);
        break;
      }
    }

    this.io.to(this.id).emit('game:abilityUsed', {
      playerId: player.id,
      ability,
      targetNodes: [...new Set(targetNodes)],
    });

    player.score += 50; // Score for using abilities
  }

  private bindPlayerEvents(socket: Socket<ClientToServerEvents, ServerToClientEvents>, player: Player): void {
    socket.on('game:createLink', (data) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;

      const validation = this.antiCheat.validateLinkCreation(
        player.id, data.fromNodeId, data.toNodeId,
        this.state.nodes, this.state.links, player
      );

      if (!validation.valid) {
        socket.emit('game:error', { message: validation.reason || 'Invalid action' });
        return;
      }

      const link = this.network.createLink(
        data.fromNodeId, data.toNodeId, player.id,
        this.state.nodes, this.state.links, player
      );

      if (link) {
        this.state.links.push(link);
        this.io.to(this.id).emit('game:linkCreated', link);

        // Combo system!
        this.handleCombo(player);

        // Score for linking
        const toNode = this.state.nodes.find((n) => n.id === data.toNodeId);
        if (toNode) {
          let scoreGain = 10;
          if (toNode.isPowerNode) scoreGain = 30;
          if (toNode.isMegaNode) scoreGain = 50;
          player.score += scoreGain;

          if (toNode.owner === player.id) {
            this.io.to(this.id).emit('game:nodesClaimed', {
              nodeIds: [data.toNodeId],
              owner: player.id,
            });
          }
        }

        console.log(`[LINK.IO] ✅ ${player.name} linked! Combo: x${player.combo} | Score: ${player.score}`);
      } else {
        socket.emit('game:error', { message: 'Cannot create that link. Check distance/energy.' });
      }
    });

    socket.on('game:destroyLink', (data) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;

      const result = this.network.destroyLink(
        data.linkId, player.id, this.state.links, this.state.nodes
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

    socket.on('game:useAbility', (data) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;
      this.handleAbility(player, data.ability);
    });

    socket.on('game:emote', (data) => {
      if (this.state.gamePhase !== 'playing') return;
      const coreNode = this.state.nodes.find(
        (n) => n.id === player.coreNodeId && n.owner === player.id
      );
      if (coreNode) {
        this.io.to(this.id).emit('game:emote', {
          playerId: player.id,
          emote: data.emote,
          position: coreNode.position,
        });
      }
    });

    socket.on('game:claimNode', () => {
      // Claiming handled through link creation
    });
  }

  private startGame(): void {
    if (this.state.gamePhase !== 'waiting') return;

    this.state.gamePhase = 'playing';
    this.state.timeRemaining = GAME_DURATION;
    this.lastTick = Date.now();

    console.log(`\n[LINK.IO] 🎮 GAME STARTED! Room ${this.code}`);
    console.log(`[LINK.IO] Players: ${this.state.players.map((p) => p.name).join(', ')}\n`);

    this.io.to(this.id).emit('game:started', this.state);
    this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  private tick(): void {
    const now = Date.now();
    const deltaTime = (now - this.lastTick) / 1000;
    this.lastTick = now;

    if (this.state.gamePhase !== 'playing') return;

    // Timer
    this.state.timeRemaining -= deltaTime;
    if (this.state.timeRemaining <= 0) {
      this.state.timeRemaining = 0;
      this.endGame();
      return;
    }

    // Update combo timers
    for (const player of this.state.players) {
      if (!player.alive) continue;
      if (player.comboTimer > 0) {
        player.comboTimer -= deltaTime;
        if (player.comboTimer <= 0) {
          player.combo = 0;
          player.comboTimer = 0;
        }
      }

      // Update ability cooldowns
      for (const ab of ['surge', 'shield', 'emp'] as AbilityType[]) {
        if (player.abilityCooldowns[ab] > 0) {
          player.abilityCooldowns[ab] = Math.max(0, player.abilityCooldowns[ab] - deltaTime);
        }
      }

      // Mega nodes reduce cooldowns faster
      const megaNodes = this.state.nodes.filter(
        (n) => n.owner === player.id && n.isMegaNode
      );
      if (megaNodes.length > 0) {
        for (const ab of ['surge', 'shield', 'emp'] as AbilityType[]) {
          if (player.abilityCooldowns[ab] > 0) {
            player.abilityCooldowns[ab] = Math.max(
              0,
              player.abilityCooldowns[ab] - deltaTime * megaNodes.length * 0.5
            );
          }
        }
      }

      // Score ticks based on territory
      player.score += player.nodeCount * 0.5 * deltaTime;
    }

    // Physics
    this.physics.update(this.state.nodes, deltaTime);

    // Energy
    this.network.updateEnergy(
      this.state.nodes, this.state.links, this.state.players, deltaTime
    );

    // Combat
    const combatResult = this.network.handleCombat(
      this.state.links, this.state.nodes, deltaTime
    );

    for (const linkId of combatResult.destroyedLinks) {
      this.io.to(this.id).emit('game:linkDestroyed', { linkId, reason: 'combat' });
    }

    for (const [playerId, nodeIds] of combatResult.collapsedNodes) {
      this.io.to(this.id).emit('game:networkCollapsed', { nodeIds, playerId });
      this.io.to(this.id).emit('game:nodesClaimed', { nodeIds, owner: null });

      // Kill feed for stolen nodes
      const victim = this.state.players.find((p) => p.id === playerId);
      // Find the likely attacker (whoever has links near these nodes)
      for (const otherPlayer of this.state.players) {
        if (otherPlayer.id === playerId || !otherPlayer.alive) continue;
        const hasNearbyLinks = this.state.links.some((l) => {
          if (l.owner !== otherPlayer.id) return false;
          return nodeIds.includes(l.fromNodeId) || nodeIds.includes(l.toNodeId);
        });
        if (hasNearbyLinks && victim) {
          this.addKillFeed(otherPlayer, victim, `stole ${nodeIds.length} nodes from`);
          otherPlayer.killCount += nodeIds.length;
          otherPlayer.score += nodeIds.length * 25;

          // Screen shake for combat
          this.io.to(this.id).emit('game:screenShake', { intensity: 5, duration: 0.3 });
          break;
        }
      }
    }

    // Check eliminated players
    for (const player of this.state.players) {
      if (!player.alive) continue;
      const coreNode = this.state.nodes.find(
        (n) => n.id === player.coreNodeId && n.owner === player.id
      );
      if (!coreNode) {
        player.alive = false;
        // Find killer
        for (const other of this.state.players) {
          if (other.id !== player.id && other.alive) {
            this.addKillFeed(other, player, 'ELIMINATED');
            other.score += 200;
            other.killCount += 1;
            this.io.to(this.id).emit('game:screenShake', { intensity: 20, duration: 0.8 });
          }
        }
      }
    }

    // Win condition
    const alivePlayers = this.state.players.filter((p) => p.alive);
    if (alivePlayers.length <= 1) {
      this.endGame();
      return;
    }

    // Clean old kill feed entries (older than 8 seconds)
    const cutoff = Date.now() - 8000;
    this.state.killFeed = this.state.killFeed.filter((e) => e.timestamp > cutoff);

    this.io.to(this.id).emit('game:state', this.state);
  }

  private endGame(): void {
    this.state.gamePhase = 'ended';

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const sortedPlayers = [...this.state.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.score - a.score; // Sort by score not energy!
    });

    const winner = sortedPlayers[0] || null;
    this.state.winner = winner?.id || null;

    console.log(`[LINK.IO] 🏆 GAME ENDED! Winner: ${winner?.name}`);
    console.log(`[LINK.IO] Scores: ${sortedPlayers.map((p) => `${p.name}:${Math.floor(p.score)}`).join(', ')}`);

    this.io.to(this.id).emit('game:ended', { winner, scores: sortedPlayers });
    this.io.to(this.id).emit('game:state', this.state);
  }

  isEmpty(): boolean { return this.state.players.length === 0; }

  destroy(): void {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.startTimeout) { clearTimeout(this.startTimeout); this.startTimeout = null; }
  }
}
