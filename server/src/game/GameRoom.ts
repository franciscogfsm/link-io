// ============================================================
// LINK.IO Server - Game Room
// Core game loop with abilities, combos, kill feed,
// respawn system, kill streaks, and optimized networking
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
const TICK_RATE = 30; // Increased from 20 for smoother gameplay
const TICK_INTERVAL = 1000 / TICK_RATE;
const GAME_DURATION = 180;
const INITIAL_ENERGY = 100;
const MAX_PLAYERS = 8;
const MIN_PLAYERS_TO_START = 2;
const NEUTRAL_NODE_COUNT = 80;
const COMBO_WINDOW = 3;
const COMBO_BONUS_BASE = 5;

// Respawn system
const RESPAWN_TIME = 5; // seconds to respawn
const RESPAWN_INVULN_TIME = 3; // seconds of invulnerability after respawn
const RESPAWN_ENERGY = 60; // energy on respawn

// Kill streak thresholds and labels
const STREAK_LABELS: [number, string][] = [
  [3, 'KILLING SPREE'],
  [5, 'RAMPAGE'],
  [7, 'DOMINATING'],
  [10, 'UNSTOPPABLE'],
  [15, 'GODLIKE'],
];

// Kill streak bounty bonuses
const STREAK_BOUNTY_BASE = 50;

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
  private lastStateHash = ''; // For delta compression
  private colorAssignments = new Map<string, string>(); // persistent color per player id

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

    // Assign persistent color
    let color = this.colorAssignments.get(socket.id);
    if (!color) {
      const usedColors = new Set(this.colorAssignments.values());
      color = PLAYER_COLORS.find((c) => !usedColors.has(c)) || PLAYER_COLORS[this.state.players.length % PLAYER_COLORS.length];
      this.colorAssignments.set(socket.id, color);
    }

    const spawnPos = this.nodeGen.getSpawnPosition(this.state.nodes);
    const coreNode = this.nodeGen.createNode(spawnPos, true, socket.id);
    this.state.nodes.push(coreNode);

    const player: Player = {
      id: socket.id,
      name: name || `Player ${this.state.players.length + 1}`,
      color,
      energy: INITIAL_ENERGY,
      coreNodeId: coreNode.id,
      nodeCount: 1,
      linkCount: 0,
      alive: true,
      score: 0,
      killCount: 0,
      deaths: 0,
      killStreak: 0,
      bestStreak: 0,
      respawnTimer: 0,
      invulnTimer: 0,
      lastKilledBy: null,
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
    const playerIndex = this.state.players.findIndex((p: Player) => p.id === socketId);
    if (playerIndex === -1) return;

    const player = this.state.players[playerIndex];

    this.state.links = this.state.links.filter((l: GameLink) => l.owner !== socketId);
    for (const node of this.state.nodes) {
      if (node.owner === socketId) {
        node.owner = null;
        node.energy = 0;
      }
    }
    this.state.nodes = this.state.nodes.filter(
      (n: GameNode) => !(n.isCore && n.owner === null && n.id === player.coreNodeId)
    );

    this.state.players.splice(playerIndex, 1);
    this.sockets.delete(socketId);
    this.colorAssignments.delete(socketId);
    this.antiCheat.cleanup(socketId);
    this.io.to(this.id).emit('room:playerLeft', { playerId: socketId });

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
    if (this.state.killFeed.length > 10) {
      this.state.killFeed = this.state.killFeed.slice(-10);
    }
    this.io.to(this.id).emit('game:killFeed', entry);
  }

  private getStreakLabel(streak: number): string | null {
    let label: string | null = null;
    for (const [threshold, text] of STREAK_LABELS) {
      if (streak >= threshold) label = text;
    }
    return label;
  }

  private eliminatePlayer(victim: Player, killer: Player | null): void {
    const coreNode = this.state.nodes.find(
      (n: GameNode) => n.id === victim.coreNodeId && n.owner === victim.id
    );
    const victimPosition = coreNode
      ? { x: coreNode.position.x, y: coreNode.position.y }
      : { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };

    victim.alive = false;
    victim.deaths++;
    victim.respawnTimer = RESPAWN_TIME;
    victim.combo = 0;
    victim.comboTimer = 0;

    // Clean up victim's network
    this.state.links = this.state.links.filter((l: GameLink) => l.owner !== victim.id);
    for (const node of this.state.nodes) {
      if (node.owner === victim.id) {
        node.owner = null;
        node.energy = 0;
      }
    }
    // Remove the old core node
    this.state.nodes = this.state.nodes.filter(
      (n: GameNode) => !(n.isCore && n.id === victim.coreNodeId)
    );

    let isRevenge = false;
    let killerStreak = 0;

    if (killer) {
      // Check revenge kill
      isRevenge = victim.lastKilledBy === null && killer.lastKilledBy === victim.id;
      if (killer.lastKilledBy === victim.id) {
        isRevenge = true;
      }

      killer.killStreak++;
      killerStreak = killer.killStreak;
      if (killer.killStreak > killer.bestStreak) {
        killer.bestStreak = killer.killStreak;
      }
      killer.killCount++;

      // Score: base + streak bonus + bounty on high-streak victim
      let eliminationScore = 200;
      eliminationScore += killer.killStreak * 25; // streak bonus
      if (victim.killStreak >= 3) {
        // Bounty for ending someone's streak!
        const bounty = STREAK_BOUNTY_BASE + victim.killStreak * 30;
        eliminationScore += bounty;
        killer.energy += bounty * 0.5; // bonus energy for bounty
      }
      if (isRevenge) {
        eliminationScore += 100; // revenge bonus
      }
      killer.score += eliminationScore;
      killer.energy += 30; // energy reward for kill

      // Kill feed
      let action = 'ELIMINATED';
      if (isRevenge) action = 'got REVENGE on';
      if (killer.killStreak >= 10) action = 'ANNIHILATED';
      else if (killer.killStreak >= 5) action = 'DESTROYED';
      this.addKillFeed(killer, victim, action);

      // Kill streak announcement
      const streakLabel = this.getStreakLabel(killer.killStreak);
      if (streakLabel) {
        this.io.to(this.id).emit('game:killStreak', {
          playerId: killer.id,
          streak: killer.killStreak,
          label: streakLabel,
        });
      }

      victim.lastKilledBy = killer.id;

      console.log(`[LINK.IO] 💀 ${killer.name} ${action} ${victim.name}! Streak: ${killer.killStreak}`);
    } else {
      this.addKillFeed(victim, victim, 'was consumed by the void');
    }

    // Big screen shake for elimination
    this.io.to(this.id).emit('game:screenShake', { intensity: 25, duration: 1.0 });

    // Emit elimination event for dramatic client effects
    this.io.to(this.id).emit('game:playerEliminated', {
      victimId: victim.id,
      killerId: killer?.id || null,
      killerStreak: killerStreak,
      isRevenge,
      victimPosition,
    });
  }

  private respawnPlayer(player: Player): void {
    const spawnPos = this.nodeGen.getSpawnPosition(this.state.nodes);
    const newCore = this.nodeGen.createNode(spawnPos, true, player.id);
    this.state.nodes.push(newCore);

    player.alive = true;
    player.coreNodeId = newCore.id;
    player.energy = RESPAWN_ENERGY;
    player.respawnTimer = 0;
    player.invulnTimer = RESPAWN_INVULN_TIME;
    player.killStreak = 0; // reset streak on death
    player.nodeCount = 1;
    player.linkCount = 0;
    player.abilityCooldowns = { surge: 0, shield: 0, emp: 0 };

    this.io.to(this.id).emit('game:playerRespawned', {
      playerId: player.id,
      coreNodeId: newCore.id,
      position: spawnPos,
    });

    console.log(`[LINK.IO] 🔄 ${player.name} respawned at (${Math.floor(spawnPos.x)}, ${Math.floor(spawnPos.y)})`);
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
    if (player.abilityCooldowns[ability] > 0) {
      const socket = this.sockets.get(player.id);
      socket?.emit('game:error', {
        message: `${ability.toUpperCase()} on cooldown (${Math.ceil(player.abilityCooldowns[ability])}s)`,
      });
      return;
    }

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
        const ownedNodeIds = new Set(
          this.state.nodes.filter((n: GameNode) => n.owner === player.id).map((n: GameNode) => n.id)
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
        this.io.to(this.id).emit('game:screenShake', { intensity: 8, duration: 0.4 });
        console.log(`[LINK.IO] ⚡ ${player.name} used SURGE! Hit ${targetNodes.length / 2} enemy links`);
        break;
      }

      case 'shield': {
        for (const link of this.state.links) {
          if (link.owner === player.id) {
            link.shielded = true;
            targetNodes.push(link.fromNodeId);
          }
        }
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
        const coreNode = this.state.nodes.find(
          (n: GameNode) => n.id === player.coreNodeId && n.owner === player.id
        );
        if (!coreNode) break;

        const empRadius = 500;
        for (const link of this.state.links) {
          if (link.owner === player.id) continue;
          const fromNode = this.state.nodes.find((n: GameNode) => n.id === link.fromNodeId);
          const toNode = this.state.nodes.find((n: GameNode) => n.id === link.toNodeId);
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

    player.score += 50;
  }

  private bindPlayerEvents(socket: Socket<ClientToServerEvents, ServerToClientEvents>, player: Player): void {
    socket.on('game:createLink', (data: { fromNodeId: string; toNodeId: string }) => {
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

        this.handleCombo(player);

        const toNode = this.state.nodes.find((n: GameNode) => n.id === data.toNodeId);
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

    socket.on('game:destroyLink', (data: { linkId: string }) => {
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

    socket.on('game:useAbility', (data: { ability: AbilityType }) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;
      this.handleAbility(player, data.ability);
    });

    socket.on('game:emote', (data: { emote: string }) => {
      if (this.state.gamePhase !== 'playing') return;
      const coreNode = this.state.nodes.find(
        (n: GameNode) => n.id === player.coreNodeId && n.owner === player.id
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
    console.log(`[LINK.IO] Players: ${this.state.players.map((p: Player) => p.name).join(', ')}\n`);

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

    // Update ALL players (alive and dead for respawn)
    for (const player of this.state.players) {
      // Respawn timer countdown
      if (!player.alive && player.respawnTimer > 0) {
        player.respawnTimer -= deltaTime;
        if (player.respawnTimer <= 0) {
          this.respawnPlayer(player);
        }
        continue; // skip other updates for dead players
      }

      if (!player.alive) continue;

      // Invulnerability countdown
      if (player.invulnTimer > 0) {
        player.invulnTimer -= deltaTime;
        if (player.invulnTimer < 0) player.invulnTimer = 0;
      }

      // Combo timer
      if (player.comboTimer > 0) {
        player.comboTimer -= deltaTime;
        if (player.comboTimer <= 0) {
          player.combo = 0;
          player.comboTimer = 0;
        }
      }

      // Ability cooldowns
      for (const ab of ['surge', 'shield', 'emp'] as AbilityType[]) {
        if (player.abilityCooldowns[ab] > 0) {
          player.abilityCooldowns[ab] = Math.max(0, player.abilityCooldowns[ab] - deltaTime);
        }
      }

      // Mega nodes reduce cooldowns faster
      const megaNodes = this.state.nodes.filter(
        (n: GameNode) => n.owner === player.id && n.isMegaNode
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

    // Combat — skip damage on invulnerable players' links
    const combatResult = this.network.handleCombat(
      this.state.links, this.state.nodes, deltaTime,
      this.state.players
    );

    for (const linkId of combatResult.destroyedLinks) {
      this.io.to(this.id).emit('game:linkDestroyed', { linkId, reason: 'combat' });
    }

    for (const [playerId, nodeIds] of combatResult.collapsedNodes) {
      this.io.to(this.id).emit('game:networkCollapsed', { nodeIds, playerId });
      this.io.to(this.id).emit('game:nodesClaimed', { nodeIds, owner: null });

      const victim = this.state.players.find((p: Player) => p.id === playerId);
      for (const otherPlayer of this.state.players) {
        if (otherPlayer.id === playerId || !otherPlayer.alive) continue;
        const hasNearbyLinks = this.state.links.some((l: GameLink) => {
          if (l.owner !== otherPlayer.id) return false;
          return nodeIds.includes(l.fromNodeId) || nodeIds.includes(l.toNodeId);
        });
        if (hasNearbyLinks && victim) {
          this.addKillFeed(otherPlayer, victim, `stole ${nodeIds.length} nodes from`);
          otherPlayer.killCount += nodeIds.length;
          otherPlayer.score += nodeIds.length * 25;
          this.io.to(this.id).emit('game:screenShake', { intensity: 5, duration: 0.3 });
          break;
        }
      }
    }

    // Check eliminated players (core node lost)
    for (const player of this.state.players) {
      if (!player.alive) continue;
      const coreNode = this.state.nodes.find(
        (n: GameNode) => n.id === player.coreNodeId && n.owner === player.id
      );
      if (!coreNode) {
        // Find the killer — closest active enemy with nearby links/nodes
        let killer: Player | null = null;
        let bestEvidence = 0;
        for (const other of this.state.players) {
          if (other.id === player.id || !other.alive) continue;
          // Count evidence: links that were near player's old nodes
          let evidence = 0;
          const nearbyPlayerNodes = this.state.nodes.filter(
            (n: GameNode) => n.owner === other.id
          );
          for (const node of nearbyPlayerNodes) {
            // Was this node recently the player's area? Check if other player has links touching
            const hasLinks = this.state.links.some((l: GameLink) =>
              l.owner === other.id &&
              (l.fromNodeId === node.id || l.toNodeId === node.id)
            );
            if (hasLinks) evidence++;
          }
          if (evidence > bestEvidence) {
            bestEvidence = evidence;
            killer = other;
          }
        }

        this.eliminatePlayer(player, killer);
      }
    }

    // Clean old kill feed entries (older than 10 seconds)
    const cutoff = Date.now() - 10000;
    this.state.killFeed = this.state.killFeed.filter((e: KillFeedEntry) => e.timestamp > cutoff);

    // No more "last player standing wins" — game runs until timer
    // Winner is determined by score at the end

    this.io.to(this.id).emit('game:state', this.state);
  }

  private endGame(): void {
    this.state.gamePhase = 'ended';

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const sortedPlayers = [...this.state.players].sort((a: Player, b: Player) => {
      return b.score - a.score;
    });

    const winner = sortedPlayers[0] || null;
    this.state.winner = winner?.id || null;

    console.log(`[LINK.IO] 🏆 GAME ENDED! Winner: ${winner?.name}`);
    console.log(`[LINK.IO] Scores: ${sortedPlayers.map((p: Player) => `${p.name}:${Math.floor(p.score)}`).join(', ')}`);

    this.io.to(this.id).emit('game:ended', { winner, scores: sortedPlayers });
    this.io.to(this.id).emit('game:state', this.state);
  }

  isEmpty(): boolean { return this.state.players.length === 0; }

  destroy(): void {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.startTimeout) { clearTimeout(this.startTimeout); this.startTimeout = null; }
  }
}
