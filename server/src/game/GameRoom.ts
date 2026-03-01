// ============================================================
// LINK.IO Server - Game Room
// Core game loop with abilities, combos, kill feed,
// respawn system, kill streaks, and optimized networking
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { Server, Socket } from 'socket.io';
import type {
  GameState, GameNode, GameLink, Player, PlayerUpgrades,
  ClientToServerEvents, ServerToClientEvents,
  KillFeedEntry, AbilityType, GameMode, MapEvent, UpgradeType
} from '../../../shared/types.js';

// Inlined from shared/types to avoid Render deploy ESM resolution issues
const UPGRADE_MAX_TIER = 3;
const UPGRADE_COSTS: Record<UpgradeType, number[]> = {
  fortify:    [120, 280, 500],
  regen:      [100, 240, 450],
  thornAura:  [150, 350, 600],
  power:      [110, 260, 480],
  siphon:     [110, 260, 480],
  corrosion:  [180, 400, 700],
  flow:       [100, 250, 460],
  efficiency: [80,  200, 380],
  magnet:     [250, 500, 800],
  reach:      [100, 240, 440],
  toughLinks: [110, 260, 480],
  speed:      [120, 280, 500],
};
const DEFAULT_UPGRADES: PlayerUpgrades = {
  fortify: 0, regen: 0, thornAura: 0,
  power: 0, siphon: 0, corrosion: 0,
  flow: 0, efficiency: 0, magnet: 0,
  reach: 0, toughLinks: 0, speed: 0,
};
import { PhysicsEngine } from './PhysicsEngine.js';
import { NetworkManager } from './NetworkManager.js';
import { NodeGenerator } from './NodeGenerator.js';
import { AntiCheat } from './AntiCheat.js';

const ARENA_BASE_WIDTH = 3500;
const ARENA_BASE_HEIGHT = 2500;
const ARENA_PER_PLAYER_WIDTH = 500;  // extra width per player beyond 2
const ARENA_PER_PLAYER_HEIGHT = 350;
const NODES_PER_PLAYER = 12;         // extra neutral nodes spawned per player
const TICK_RATE = 20; // lower tick rate for better server performance
const TICK_INTERVAL = 1000 / TICK_RATE;
const GAME_DURATION = 180;
const INITIAL_ENERGY = 80; // buffed from 50 so players can immediately create links
const MAX_PLAYERS = 20;
const MIN_PLAYERS_TO_START = 2;
const NEUTRAL_NODE_COUNT = 80;
const COMBO_WINDOW = 3;
const COMBO_BONUS_BASE = 1; // nerfed from 2

// Click mechanics
const CLICK_STREAK_WINDOW = 1.0;     // seconds to keep click streak alive
const CLICK_BASE_ENERGY = 0.3;       // base energy per click (nerfed from 0.5)
const CLICK_STREAK_BONUS = 0.1;      // extra energy per streak level (nerfed from 0.25)
const CLICK_STREAK_CAP = 6;          // max streak level for bonus calculation
const CLICK_COOLDOWN = 0.15;         // min seconds between clicks (anti-macro)
const GOLD_NODE_SPAWN_INTERVAL = 30; // seconds between gold node spawns
const GOLD_NODE_LIFETIME = 6;        // seconds before gold node despawns

// Respawn system
const RESPAWN_TIME = 5; // seconds to respawn
const RESPAWN_INVULN_TIME = 8; // seconds of invulnerability after respawn
const RESPAWN_ENERGY = 100; // generous respawn energy for comeback

// Health system
const PLAYER_MAX_HEALTH = 100;
const CORE_DAMAGE_PER_SECOND = 20;  // damage per link touching enemy core per second
const CORE_PROXIMITY_DAMAGE = 5;    // passive damage/s when enemy nodes are near your core (no link needed)
const CORE_PROXIMITY_DAMAGE_RANGE = 350; // range for proximity damage
const HEALTH_REGEN_RATE = 2;         // HP/s regen when not taking damage
const DAMAGE_COOLDOWN = 4;           // seconds before regen starts
// Movement system — energy cost, mass-based, links break if overstretched
const MOVE_BASE_SPEED = 200;         // px/s base speed (with 0 nodes)
const MOVE_MASS_PENALTY = 0.08;      // speed multiplier lost per owned node
const MOVE_LINK_PENALTY = 0.015;     // speed multiplier lost per link
const MOVE_AGILITY_BONUS = 1.5;      // speed multiplier when 0 links (free roaming)
const MOVE_ENERGY_COST = 8;          // energy/s while moving
const MOVE_ACCELERATION = 12;        // how fast you reach max speed (higher = snappier)
const MOVE_FRICTION = 8;             // how fast you stop
const LINK_STRETCH_DISTANCE = 420;   // links start warning at this distance
const LINK_BREAK_DISTANCE = 500;     // links snap at this distance

// Core protection — attacker must own a node within this range of the core to link to it
const CORE_PROXIMITY_REQUIRED = 400;

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
  warp: 25,
};

const ABILITY_COOLDOWNS: Record<AbilityType, number> = {
  surge: 12,
  shield: 15,
  emp: 20,
  warp: 10,
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
  private lastStateHash = '';
  private colorAssignments = new Map<string, string>();
  private gameMode: GameMode = 'ffa';
  private nextTeam = 1;
  private eventTimer = 0;
  private eventInterval = 25; // seconds between events
  private activeEvents: MapEvent[] = [];
  private playerMoveInputs = new Map<string, { x: number; y: number }>();
  private playerVelocities = new Map<string, { x: number; y: number }>();
  private _magnetCooldowns = new Map<string, number>();
  private lastClickTime = new Map<string, number>();
  private goldNodeTimer = 0;
  private currentArenaWidth: number;
  private currentArenaHeight: number;
  private lastPlayerCount = 0;
  // Persistent lookup maps — rebuilt once per tick, reused by all subsystems
  private nodeMap = new Map<string, GameNode>();
  private playerMap = new Map<string, Player>();
  private tickCount = 0;
  private nodesByOwner = new Map<string, GameNode[]>();
  private linksByOwner = new Map<string, GameLink[]>();
  private linkMap = new Map<string, GameLink>();
  private _stateTickCounter = 0;

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>, code: string, gameMode: GameMode = 'ffa') {
    this.id = uuidv4();
    this.code = code;
    this.io = io;
    this.gameMode = gameMode;
    this.currentArenaWidth = ARENA_BASE_WIDTH;
    this.currentArenaHeight = ARENA_BASE_HEIGHT;
    this.physics = new PhysicsEngine(this.currentArenaWidth, this.currentArenaHeight);
    this.network = new NetworkManager();
    this.nodeGen = new NodeGenerator(this.currentArenaWidth, this.currentArenaHeight);
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
      arenaWidth: this.currentArenaWidth,
      arenaHeight: this.currentArenaHeight,
      gameMode,
      teamScores: [0, 0, 0, 0, 0],
      mapEvents: [],
      nextEventIn: this.eventInterval,
    };
  }

  get playerCount(): number { return this.state.players.length; }
  get maxPlayers(): number { return MAX_PLAYERS; }
  get gamePhase(): string { return this.state.gamePhase; }
  get isFull(): boolean { return this.state.players.length >= MAX_PLAYERS; }

  addPlayer(socket: Socket<ClientToServerEvents, ServerToClientEvents>, name: string, forcedTeam?: number): Player | null {
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

    // Assign team in team mode
    let team = 0;
    if (this.gameMode === 'teams') {
      if (forcedTeam !== undefined && forcedTeam > 0) {
        team = forcedTeam;
      } else {
        team = this.nextTeam;
        this.nextTeam = this.nextTeam === 1 ? 2 : 1;
      }
    }

    const player: Player = {
      id: socket.id,
      name: name || `Player ${this.state.players.length + 1}`,
      color,
      energy: INITIAL_ENERGY,
      health: PLAYER_MAX_HEALTH,
      maxHealth: PLAYER_MAX_HEALTH,
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
      lastDamagedBy: null,
      combo: 0,
      comboTimer: 0,
      abilityCooldowns: { surge: 0, shield: 0, emp: 0, warp: 0 },
      team,
      assists: 0,
      nodesStolen: 0,
      longestChain: 0,
      totalEnergyGenerated: 0,
      peakNodeCount: 1,
      upgrades: { ...DEFAULT_UPGRADES },
      clickStreak: 0,
      clickStreakTimer: 0,
      bestClickStreak: 0,
      totalClicks: 0,
      shieldActive: false,
    };

    this.state.players.push(player);
    this.sockets.set(socket.id, socket);
    this.bindPlayerEvents(socket, player);

    socket.join(this.id);
    this.io.to(this.id).emit('room:playerJoined', { player });

    // Scale arena for player count
    this.scaleArena();

    if (this.state.gamePhase === 'playing') {
      // Mid-game join: give invulnerability and send current state so client renders immediately
      player.invulnTimer = RESPAWN_INVULN_TIME + 2; // extra grace period
      player.energy = RESPAWN_ENERGY;
      socket.emit('game:started', this.state);
      console.log(`[LINK.IO] 🔄 ${player.name} joined mid-game in room ${this.code}`);
    } else if (this.state.players.length >= MIN_PLAYERS_TO_START && this.state.gamePhase === 'waiting') {
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
    this.playerMoveInputs.delete(socketId);
    this.playerVelocities.delete(socketId);
    this._magnetCooldowns.delete(socketId);
    this.lastClickTime.delete(socketId);
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
      : { x: this.currentArenaWidth / 2, y: this.currentArenaHeight / 2 };

    victim.alive = false;
    victim.deaths++;
    victim.respawnTimer = RESPAWN_TIME;
    victim.combo = 0;
    victim.comboTimer = 0;
    victim.killStreak = 0; // reset streak on death

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
      // Check revenge kill — did victim previously kill us?
      isRevenge = killer.lastKilledBy === victim.id;

      killer.killStreak++;
      killerStreak = killer.killStreak;
      if (killer.killStreak > killer.bestStreak) {
        killer.bestStreak = killer.killStreak;
      }
      killer.killCount++;

      // Score: base + streak bonus + bounty on high-streak victim
      let eliminationScore = 500;
      eliminationScore += killer.killStreak * 50; // streak bonus
      if (victim.killStreak >= 3) {
        // Bounty for ending someone's streak!
        const bounty = STREAK_BOUNTY_BASE + victim.killStreak * 50;
        eliminationScore += bounty;
        killer.energy += bounty * 0.5; // bonus energy for bounty
      }
      if (isRevenge) {
        eliminationScore += 250; // revenge bonus
      }
      killer.score += eliminationScore;
      killer.energy += 5; // energy reward for kill (nerfed from 8)

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
    player.health = PLAYER_MAX_HEALTH;
    player.respawnTimer = 0;
    player.invulnTimer = RESPAWN_INVULN_TIME;
    player.nodeCount = 1;
    player.linkCount = 0;
    player.lastDamagedBy = null;
    player.abilityCooldowns = { surge: 0, shield: 0, emp: 0, warp: 0 };
    player.shieldActive = false;

    // Team: assign same team
    // (team stays the same across respawns)

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

  private handleAbility(player: Player, ability: AbilityType, targetNodeId?: string): void {
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
          if (link.owner !== player.id && !link.shielded) {
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
        player.shieldActive = true;
        for (const link of this.state.links) {
          if (link.owner === player.id) {
            link.shielded = true;
            targetNodes.push(link.fromNodeId);
          }
        }
        setTimeout(() => {
          player.shieldActive = false;
          for (const link of this.state.links) {
            if (link.owner === player.id) {
              link.shielded = false;
            }
          }
        }, 8000);
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
            if (!link.shielded) {
              link.health -= 50;
              targetNodes.push(link.fromNodeId, link.toNodeId);
            }
          }
        }
        this.io.to(this.id).emit('game:screenShake', { intensity: 15, duration: 0.6 });
        console.log(`[LINK.IO] 💣 ${player.name} used EMP! Range ${empRadius}, hit ${targetNodes.length / 2} links`);
        break;
      }

      case 'warp': {
        if (!targetNodeId) {
          const socket = this.sockets.get(player.id);
          socket?.emit('game:error', { message: 'Select a node to warp to!' });
          // Refund
          player.energy += ABILITY_COSTS.warp;
          player.abilityCooldowns.warp = 0;
          return;
        }
        const targetNode = this.state.nodes.find((n: GameNode) => n.id === targetNodeId);
        if (!targetNode || targetNode.owner !== player.id || targetNode.isCore) {
          const socket = this.sockets.get(player.id);
          socket?.emit('game:error', { message: 'Invalid warp target!' });
          player.energy += ABILITY_COSTS.warp;
          player.abilityCooldowns.warp = 0;
          return;
        }
        // Swap core status
        const oldCore = this.state.nodes.find((n: GameNode) => n.id === player.coreNodeId);
        if (oldCore) {
          oldCore.isCore = false;
          oldCore.radius = 12; // becomes a regular (slightly bigger) node
        }
        targetNode.isCore = true;
        targetNode.radius = 18;
        player.coreNodeId = targetNode.id;
        targetNodes.push(targetNode.id);
        if (oldCore) targetNodes.push(oldCore.id);
        this.io.to(this.id).emit('game:screenShake', { intensity: 5, duration: 0.3 });
        console.log(`[LINK.IO] 🌀 ${player.name} WARPED to node ${targetNode.id}`);
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

      // CORE PROTECTION — can't link to enemy core unless you own a nearby node
      const toNode = this.state.nodes.find((n: GameNode) => n.id === data.toNodeId);
      if (toNode && toNode.isCore && toNode.owner && toNode.owner !== player.id) {
        const playerNodes = this.state.nodes.filter((n: GameNode) => n.owner === player.id && !n.isCore);
        const hasProximity = playerNodes.some((n: GameNode) => {
          const dx = n.position.x - toNode.position.x;
          const dy = n.position.y - toNode.position.y;
          return Math.sqrt(dx * dx + dy * dy) < CORE_PROXIMITY_REQUIRED;
        });
        if (!hasProximity) {
          socket.emit('game:error', { message: 'Must own a node near enemy core first! Expand your network.' });
          return;
        }
      }

      // Apply reach upgrade to link distance
      const reachBonus = 1 + [0, 0.15, 0.30, 0.50][player.upgrades.reach];

      const link = this.network.createLink(
        data.fromNodeId, data.toNodeId, player.id,
        this.state.nodes, this.state.links, player,
        reachBonus
      );

      if (link) {
        // Apply toughLinks upgrade — boost link HP
        const hpBonus = 1 + [0, 0.30, 0.60, 1.0][player.upgrades.toughLinks];
        link.maxHealth *= hpBonus;
        link.health *= hpBonus;

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

    socket.on('game:useAbility', (data: { ability: AbilityType; targetNodeId?: string }) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;
      this.handleAbility(player, data.ability, data.targetNodeId);
    });

    socket.on('game:upgrade', (data: { upgrade: UpgradeType }) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;
      const upgradeType = data.upgrade;
      const currentTier = player.upgrades[upgradeType];
      if (currentTier >= UPGRADE_MAX_TIER) {
        socket.emit('game:error', { message: `${upgradeType.toUpperCase()} already maxed!` });
        return;
      }
      const cost = UPGRADE_COSTS[upgradeType][currentTier];
      if (player.energy < cost) {
        socket.emit('game:error', { message: `Need ${cost} energy! (have ${Math.floor(player.energy)})` });
        return;
      }
      player.energy -= cost;
      player.upgrades[upgradeType] = currentTier + 1;
      player.score += 30 * (currentTier + 1);

      this.io.to(this.id).emit('game:upgraded', {
        playerId: player.id,
        upgrade: upgradeType,
        tier: currentTier + 1,
      });
      console.log(`[LINK.IO] ⬆ ${player.name} upgraded ${upgradeType} to tier ${currentTier + 1}`);
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

    socket.on('game:move', (data: { direction: { x: number; y: number } }) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;
      // Normalize direction vector
      const dx = data.direction.x;
      const dy = data.direction.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        this.playerMoveInputs.set(socket.id, { x: dx / len, y: dy / len });
      } else {
        this.playerMoveInputs.delete(socket.id);
      }
    });

    socket.on('game:claimNode', () => {
      // Claiming handled through link creation
    });

    // ============ CLICK NODE — spam clicks on your nodes for energy ============
    socket.on('game:clickNode', (data: { nodeId: string }) => {
      if (this.state.gamePhase !== 'playing' || !player.alive) return;

      // Anti-macro: enforce minimum click interval
      const now = Date.now();
      const lastClick = this.lastClickTime.get(player.id) || 0;
      if (now - lastClick < CLICK_COOLDOWN * 1000) return;
      this.lastClickTime.set(player.id, now);

      const node = this.state.nodes.find((n: GameNode) => n.id === data.nodeId);
      if (!node) return;

      // Must own the node OR it must be a gold node near your network
      const isOwned = node.owner === player.id;
      const isGold = node.isGoldNode && node.goldEnergy > 0;

      if (!isOwned && !isGold) return;

      // For gold nodes: must have a node nearby (within 400px)
      if (isGold && !isOwned) {
        const hasNearby = this.state.nodes.some((n: GameNode) =>
          n.owner === player.id &&
          Math.sqrt((n.position.x - node.position.x) ** 2 + (n.position.y - node.position.y) ** 2) < 400
        );
        if (!hasNearby) return;
      }

      // Update click streak
      player.totalClicks++;
      if (player.clickStreakTimer > 0) {
        player.clickStreak++;
      } else {
        player.clickStreak = 1;
      }
      player.clickStreakTimer = CLICK_STREAK_WINDOW;
      if (player.clickStreak > player.bestClickStreak) {
        player.bestClickStreak = player.clickStreak;
      }

      // Calculate energy reward (capped streak)
      const effectiveStreak = Math.min(player.clickStreak, CLICK_STREAK_CAP);
      let energy = CLICK_BASE_ENERGY + effectiveStreak * CLICK_STREAK_BONUS;

      // Gold nodes give bonus energy (heavily nerfed)
      if (isGold) {
        const goldReward = Math.min(1 + Math.min(effectiveStreak, 2), node.goldEnergy);
        node.goldEnergy -= goldReward;
        energy += goldReward;

        // Gold node depleted
        if (node.goldEnergy <= 0) {
          node.isGoldNode = false;
          node.goldEnergy = 0;
        }
      }

      // Power nodes give bonus clicks
      if (node.isPowerNode) energy *= 1.5;
      if (node.isMegaNode) energy *= 2;

      player.energy += energy;
      player.score += Math.floor(energy * 0.5);

      // Build the streak message
      let message = `+${Math.floor(energy)}⚡`;
      if (player.clickStreak >= 5) message += ` 🔥x${player.clickStreak}`;
      if (player.clickStreak >= 10) message = `⚡ CLICK FRENZY x${player.clickStreak}! +${Math.floor(energy)}`;
      if (player.clickStreak >= 20) message = `💥 CLICK MADNESS x${player.clickStreak}! +${Math.floor(energy)}`;
      if (isGold) message += ' 💰';

      socket.emit('game:clickReward', {
        playerId: player.id,
        nodeId: data.nodeId,
        energy: Math.floor(energy),
        streak: player.clickStreak,
        message,
      });
    });
  }

  /** Dynamically scale the arena based on player count */
  private scaleArena(): void {
    const playerCount = this.state.players.length;
    if (playerCount === this.lastPlayerCount) return;
    this.lastPlayerCount = playerCount;

    const extraPlayers = Math.max(0, playerCount - 2);
    const newWidth = ARENA_BASE_WIDTH + extraPlayers * ARENA_PER_PLAYER_WIDTH;
    const newHeight = ARENA_BASE_HEIGHT + extraPlayers * ARENA_PER_PLAYER_HEIGHT;

    if (newWidth !== this.currentArenaWidth || newHeight !== this.currentArenaHeight) {
      const oldWidth = this.currentArenaWidth;
      const oldHeight = this.currentArenaHeight;
      this.currentArenaWidth = newWidth;
      this.currentArenaHeight = newHeight;

      // Update physics and node generator bounds
      this.physics.arenaWidth = newWidth;
      this.physics.arenaHeight = newHeight;
      this.nodeGen.arenaWidth = newWidth;
      this.nodeGen.arenaHeight = newHeight;
      this.state.arenaWidth = newWidth;
      this.state.arenaHeight = newHeight;

      // Spawn extra nodes in the new area
      if (newWidth > oldWidth || newHeight > oldHeight) {
        const extraNodes = NODES_PER_PLAYER * Math.max(1, extraPlayers);
        const currentNeutralCount = this.state.nodes.filter(n => !n.owner && !n.isCore).length;
        const targetCount = NEUTRAL_NODE_COUNT + extraPlayers * NODES_PER_PLAYER;
        const needed = Math.max(0, targetCount - currentNeutralCount);
        if (needed > 0) {
          const newNodes = this.nodeGen.generateExtraNodes(needed, this.state.nodes);
          this.state.nodes.push(...newNodes);
        }
      }

      console.log(`[LINK.IO] 🗺 Arena scaled to ${newWidth}x${newHeight} for ${playerCount} players (+${Math.max(0, this.state.nodes.length - NEUTRAL_NODE_COUNT)} extra nodes)`);
    }
  }

  private startGame(): void {
    if (this.state.gamePhase !== 'waiting') return;

    this.state.gamePhase = 'playing';
    this.state.timeRemaining = GAME_DURATION;
    this.lastTick = Date.now();

    console.log(`\n[LINK.IO] 🎮 GAME STARTED! Room ${this.code}`);
    console.log(`[LINK.IO] Players: ${this.state.players.map((p: Player) => p.name).join(', ')}\n`);

    this.io.to(this.id).emit('game:started', this.state);
    // Use recursive setTimeout instead of setInterval to prevent tick stacking
    const scheduleTick = () => {
      this.tickInterval = setTimeout(() => {
        this.tick();
        if (this.state.gamePhase === 'playing') scheduleTick();
      }, TICK_INTERVAL) as unknown as ReturnType<typeof setInterval>;
    };
    scheduleTick();
  }

  private tick(): void {
    const now = Date.now();
    // Clamp deltaTime to prevent physics/damage spikes after GC pauses
    const deltaTime = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;
    this.tickCount++;

    if (this.state.gamePhase !== 'playing') return;

    // Timer
    this.state.timeRemaining -= deltaTime;
    if (this.state.timeRemaining <= 0) {
      this.state.timeRemaining = 0;
      this.endGame();
      return;
    }

    // --- Respawn pass (before index build, may add core nodes) ---
    for (const player of this.state.players) {
      if (!player.alive && player.respawnTimer > 0) {
        player.respawnTimer -= deltaTime;
        if (player.respawnTimer <= 0) {
          this.respawnPlayer(player);
        }
      }
    }

    // --- Build lookup indexes ONCE per tick — O(N+L+P) amortized ---
    this.nodeMap.clear();
    this.playerMap.clear();
    this.nodesByOwner.clear();
    this.linksByOwner.clear();
    this.linkMap.clear();
    for (const n of this.state.nodes) {
      this.nodeMap.set(n.id, n);
      const key = n.owner ?? '';
      const arr = this.nodesByOwner.get(key);
      if (arr) arr.push(n);
      else this.nodesByOwner.set(key, [n]);
    }
    for (const l of this.state.links) {
      this.linkMap.set(l.id, l);
      const arr = this.linksByOwner.get(l.owner);
      if (arr) arr.push(l);
      else this.linksByOwner.set(l.owner, [l]);
    }
    for (const p of this.state.players) this.playerMap.set(p.id, p);

    // --- Update alive players ---
    for (const player of this.state.players) {
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
      for (const ab of ['surge', 'shield', 'emp', 'warp'] as AbilityType[]) {
        if (player.abilityCooldowns[ab] > 0) {
          player.abilityCooldowns[ab] = Math.max(0, player.abilityCooldowns[ab] - deltaTime);
        }
      }

      // Mega nodes reduce cooldowns faster — use owner index
      let megaNodeCount = 0;
      const _ownedNodes = this.nodesByOwner.get(player.id);
      if (_ownedNodes) {
        for (const n of _ownedNodes) {
          if (n.isMegaNode) megaNodeCount++;
        }
      }
      if (megaNodeCount > 0) {
        for (const ab of ['surge', 'shield', 'emp', 'warp'] as AbilityType[]) {
          if (player.abilityCooldowns[ab] > 0) {
            player.abilityCooldowns[ab] = Math.max(
              0,
              player.abilityCooldowns[ab] - deltaTime * megaNodeCount * 0.5
            );
          }
        }
      }

      // Score ticks based on territory (more dynamic!)
      // Track peak node count
      if (player.nodeCount > player.peakNodeCount) {
        player.peakNodeCount = player.nodeCount;
      }

      const territoryScore = player.nodeCount * 0.5 + player.linkCount * 0.3;
      player.score += territoryScore * deltaTime;

      // Longest chain tracking (every 5 ticks to save CPU)
      if (this.tickCount % 5 === 0) {
        const chain = this.calculateLongestChain(player.id);
        if (chain > player.longestChain) {
          player.longestChain = chain;
          if (chain >= 8) player.score += 50; // chain milestone bonus
        }
      }

      // Comeback mechanic: scaled underdog boost based on how far behind you are
      if (player.alive) {
        let aliveCount = 0; let totalNodes = 0; let maxNodes = 0;
        for (const p of this.state.players) {
          if (p.alive) { aliveCount++; totalNodes += p.nodeCount; maxNodes = Math.max(maxNodes, p.nodeCount); }
        }
        const avgNodes = totalNodes / Math.max(aliveCount, 1);
        if (player.nodeCount <= 3) {
          // Flat base boost for tiny networks (just respawned)
          player.energy += 3 * deltaTime;
        }
        if (player.nodeCount < avgNodes * 0.6 && avgNodes > 3) {
          // Scaled boost: bigger gap = bigger boost
          const gap = (avgNodes - player.nodeCount) / Math.max(avgNodes, 1);
          player.energy += (2 + gap * 6) * deltaTime;
        }
        // Extra catchup when a dominant player exists (2x+ your nodes)
        if (maxNodes > player.nodeCount * 2 && player.nodeCount <= 5) {
          player.energy += 2 * deltaTime;
        }
      }

      // Click streak decay
      if (player.clickStreakTimer > 0) {
        player.clickStreakTimer -= deltaTime;
        if (player.clickStreakTimer <= 0) {
          player.clickStreak = 0;
          player.clickStreakTimer = 0;
        }
      }

      // Regen upgrade — boost health regen
      if (player.alive && player.upgrades.regen > 0) {
        const regenBonus = [0, 0.5, 1.0, 2.0][player.upgrades.regen];
        // Only regen if not actively being damaged (checked later, but apply passive bonus here)
        if (player.health < player.maxHealth) {
          player.health = Math.min(player.maxHealth, player.health + regenBonus * deltaTime);
        }
      }

      // Magnet upgrade — auto-claim ONE nearby unowned node on cooldown, costs energy
      if (player.alive && player.upgrades.magnet > 0) {
        const magnetRange = [0, 100, 160, 220][player.upgrades.magnet];
        const magnetRangeSq = magnetRange * magnetRange;
        const magnetCooldown = [0, 1.5, 1.2, 0.9][player.upgrades.magnet]; // seconds between grabs
        const magnetEnergyCost = 5; // energy cost per auto-grab
        // Use per-player cooldown tracker
        let lastMagnet = this._magnetCooldowns.get(player.id) || 0;
        const now = this.tickCount / TICK_RATE;
        if (now - lastMagnet >= magnetCooldown && player.energy >= magnetEnergyCost) {
          let claimed = false;
          const _magnetOwned = this.nodesByOwner.get(player.id) || [];
          const _magnetNeutral = this.nodesByOwner.get('') || [];
          for (const owned of _magnetOwned) {
            if (claimed) break;
            for (const node of _magnetNeutral) {
              if (claimed) break;
              if (node.isCore) continue;
              const dx = node.position.x - owned.position.x;
              const dy = node.position.y - owned.position.y;
              if (dx * dx + dy * dy < magnetRangeSq) {
                node.owner = player.id;
                player.energy -= magnetEnergyCost;
                const link = this.network.createLink(
                  owned.id, node.id, player.id,
                  this.state.nodes, this.state.links, player,
                  1 + [0, 0.15, 0.30, 0.50][player.upgrades.reach]
                );
                if (link) {
                  this.state.links.push(link);
                  player.score += 5;
                }
                claimed = true;
                this._magnetCooldowns.set(player.id, now);
              }
            }
          }
        }
      }
    }

    // Gold node spawning
    this.goldNodeTimer += deltaTime;
    if (this.goldNodeTimer >= GOLD_NODE_SPAWN_INTERVAL) {
      this.goldNodeTimer = 0;
      const goldNode = this.nodeGen.spawnGoldNode(this.state.nodes);
      if (goldNode) {
        this.state.nodes.push(goldNode);
        console.log(`[LINK.IO] 💰 Gold node spawned at (${Math.floor(goldNode.position.x)}, ${Math.floor(goldNode.position.y)})`);
      }
    }

    // Gold node expiry — despawn after GOLD_NODE_LIFETIME seconds
    for (const node of this.state.nodes) {
      if (node.isGoldNode && node.goldExpireTimer > 0) {
        node.goldExpireTimer -= deltaTime;
        if (node.goldExpireTimer <= 0) {
          node.isGoldNode = false;
          node.goldEnergy = 0;
          node.goldExpireTimer = 0;
        }
      }
    }

    // Physics
    this.physics.update(this.state.nodes, deltaTime);

    // Player WASD movement — momentum-based, costs energy, mass slows you
    for (const player of this.state.players) {
      if (!player.alive) continue;
      const coreNode = this.nodeMap.get(player.coreNodeId);
      if (!coreNode || coreNode.owner !== player.id) continue;

      const input = this.playerMoveInputs.get(player.id);
      let vel = this.playerVelocities.get(player.id) || { x: 0, y: 0 };

      // Mass-based max speed: more nodes + links = slower, 0 links = agility bonus
      const massFactor = Math.max(0.15, 1 - player.nodeCount * MOVE_MASS_PENALTY - player.linkCount * MOVE_LINK_PENALTY);
      const agilityBonus = player.linkCount === 0 ? MOVE_AGILITY_BONUS : 1;
      const speedBonus = 1 + [0, 0.20, 0.40, 0.70][player.upgrades.speed];
      const maxSpeed = MOVE_BASE_SPEED * massFactor * speedBonus * agilityBonus;

      if (input && (input.x !== 0 || input.y !== 0) && player.energy > 1) {
        // Accelerate toward input direction
        vel.x += input.x * maxSpeed * MOVE_ACCELERATION * deltaTime;
        vel.y += input.y * maxSpeed * MOVE_ACCELERATION * deltaTime;

        // Drain energy while moving (speed upgrade reduces drain)
        const moveCostReduction = 1 - [0, 0.15, 0.25, 0.40][player.upgrades.speed];
        player.energy -= MOVE_ENERGY_COST * moveCostReduction * deltaTime;
        if (player.energy < 0) player.energy = 0;
      } else {
        // Friction deceleration
        vel.x *= Math.max(0, 1 - MOVE_FRICTION * deltaTime);
        vel.y *= Math.max(0, 1 - MOVE_FRICTION * deltaTime);
      }

      // Clamp to max speed
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      if (speed > maxSpeed) {
        vel.x = (vel.x / speed) * maxSpeed;
        vel.y = (vel.y / speed) * maxSpeed;
      }
      // Kill tiny velocities
      if (Math.abs(vel.x) < 0.5 && Math.abs(vel.y) < 0.5) { vel.x = 0; vel.y = 0; }

      this.playerVelocities.set(player.id, vel);

      // Apply velocity
      if (vel.x !== 0 || vel.y !== 0) {
        coreNode.position.x += vel.x * deltaTime;
        coreNode.position.y += vel.y * deltaTime;

        // Arena bounds
        coreNode.position.x = Math.max(20, Math.min(this.currentArenaWidth - 20, coreNode.position.x));
        coreNode.position.y = Math.max(20, Math.min(this.currentArenaHeight - 20, coreNode.position.y));

        // LINK STRETCH/BREAK — links connected to this core that are too far break
        for (let i = this.state.links.length - 1; i >= 0; i--) {
          const link = this.state.links[i];
          if (link.owner !== player.id) continue;
          // Only check links connected to the core
          if (link.fromNodeId !== coreNode.id && link.toNodeId !== coreNode.id) continue;

          const otherNodeId = link.fromNodeId === coreNode.id ? link.toNodeId : link.fromNodeId;
          const otherNode = this.nodeMap.get(otherNodeId);
          if (!otherNode) continue;

          const dx = coreNode.position.x - otherNode.position.x;
          const dy = coreNode.position.y - otherNode.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > LINK_BREAK_DISTANCE) {
            // Snap the link
            const broken = this.state.links.splice(i, 1)[0];
            this.io.to(this.id).emit('game:linkDestroyed', {
              linkId: broken.id, reason: 'overstretched'
            });

            // Check for disconnected nodes
            const result = this.network.findDisconnectedNodes(
              player.id, this.state.nodes, this.state.links
            );
            if (result.length > 0) {
              for (const nodeId of result) {
                const n = this.nodeMap.get(nodeId);
                if (n) { n.owner = null; n.energy = 0; }
              }
              this.io.to(this.id).emit('game:networkCollapsed', {
                nodeIds: result, playerId: player.id
              });
              this.io.to(this.id).emit('game:nodesClaimed', {
                nodeIds: result, owner: null
              });
            }
          } else if (dist > LINK_STRETCH_DISTANCE) {
            // Damage the link proportionally when overstretched
            const stretchRatio = (dist - LINK_STRETCH_DISTANCE) / (LINK_BREAK_DISTANCE - LINK_STRETCH_DISTANCE);
            link.health -= link.maxHealth * stretchRatio * 0.5 * deltaTime;
          }
        }
      }
    }

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

    // Link decay — fringe links slowly lose health, core-connected links repair
    const decayedLinkIds = this.network.updateLinkDecay(
      this.state.links, this.state.nodes, this.state.players, deltaTime
    );
    for (const linkId of decayedLinkIds) {
      const link = this.linkMap.get(linkId);
      if (link) {
        const linkIdx = this.state.links.indexOf(link);
        if (linkIdx !== -1) this.state.links.splice(linkIdx, 1);
        this.io.to(this.id).emit('game:linkDestroyed', { linkId, reason: 'decay' });

        // Check for disconnected nodes from decay
        const disconnected = this.network.findDisconnectedNodes(
          link.owner, this.state.nodes, this.state.links
        );
        if (disconnected.length > 0) {
          const disconnectedSet = new Set(disconnected);
          for (const nodeId of disconnected) {
            const node = this.nodeMap.get(nodeId);
            if (node && !node.isCore) {
              node.owner = null;
              node.energy = 0;
            }
          }
          // Remove orphan links
          for (let j = this.state.links.length - 1; j >= 0; j--) {
            if (
              this.state.links[j].owner === link.owner &&
              (disconnectedSet.has(this.state.links[j].fromNodeId) ||
                disconnectedSet.has(this.state.links[j].toNodeId))
            ) {
              this.state.links.splice(j, 1);
            }
          }
          this.io.to(this.id).emit('game:networkCollapsed', { nodeIds: disconnected, playerId: link.owner });
          this.io.to(this.id).emit('game:nodesClaimed', { nodeIds: disconnected, owner: null });
        }
      }
    }

    for (const [playerId, nodeIds] of combatResult.collapsedNodes) {
      this.io.to(this.id).emit('game:networkCollapsed', { nodeIds, playerId });
      this.io.to(this.id).emit('game:nodesClaimed', { nodeIds, owner: null });

      const victim = this.playerMap.get(playerId) || null;
      for (const otherPlayer of this.state.players) {
        if (otherPlayer.id === playerId || !otherPlayer.alive) continue;
        const hasNearbyLinks = this.state.links.some((l: GameLink) => {
          if (l.owner !== otherPlayer.id) return false;
          return nodeIds.includes(l.fromNodeId) || nodeIds.includes(l.toNodeId);
        });
        if (hasNearbyLinks && victim) {
          this.addKillFeed(otherPlayer, victim, `stole ${nodeIds.length} nodes from`);
          otherPlayer.nodesStolen += nodeIds.length;
          otherPlayer.score += nodeIds.length * 25;
          this.io.to(this.id).emit('game:screenShake', { intensity: 5, duration: 0.3 });
          break;
        }
      }
    }

    // ============ CORE DAMAGE — HP SYSTEM ============
    // Indexes already built at tick start
    const nodeMap = this.nodeMap;
    const playerMap = this.playerMap;

    // Track which cores are being attacked (for health regen check later)
    const attackedCores = new Set<string>();

    // Links touching an enemy's core node deal damage to that player's health
    for (const link of this.state.links) {
      const toNode = nodeMap.get(link.toNodeId);
      const fromNode = nodeMap.get(link.fromNodeId);
      if (!toNode || !fromNode) continue;

      // Check if this link connects to an enemy CORE
      let targetCore: GameNode | null = null;
      let coreOwner: Player | null = null;
      if (toNode.isCore && toNode.owner && toNode.owner !== link.owner) {
        targetCore = toNode;
        coreOwner = playerMap.get(toNode.owner) || null;
      } else if (fromNode.isCore && fromNode.owner && fromNode.owner !== link.owner) {
        targetCore = fromNode;
        coreOwner = playerMap.get(fromNode.owner) || null;
      }

      if (targetCore && coreOwner && coreOwner.alive) {
        attackedCores.add(coreOwner.id);
        // Don't damage invulnerable or shielded players
        if (coreOwner.invulnTimer > 0 || coreOwner.shieldActive) continue;

        const attacker = playerMap.get(link.owner);
        if (!attacker || !attacker.alive) continue;

        // Network power scaling: attacker's damage scales with their network
        const attackerPowerTier = [0, 0.25, 0.50, 0.80][attacker.upgrades.power];
        const networkMultiplier = 1 + (attacker.nodeCount - 1) * 0.08 + attackerPowerTier;
        // Defender's fortify upgrade reduces damage
        const fortifyReduction = 1 - [0, 0.20, 0.35, 0.50][coreOwner.upgrades.fortify];
        const damage = CORE_DAMAGE_PER_SECOND * deltaTime * networkMultiplier * fortifyReduction;
        coreOwner.health -= damage;
        coreOwner.lastDamagedBy = attacker.id;

        // THORN AURA — reflect damage back to the attacker's link
        if (coreOwner.upgrades.thornAura > 0) {
          const thornReflect = [0, 0.15, 0.30, 0.50][coreOwner.upgrades.thornAura];
          link.health -= damage * thornReflect * 15;
        }

        // CORROSION — simplified: just damage all enemy links touching the target core directly
        if (attacker.upgrades.corrosion > 0) {
          const splashDmg = damage * [0, 0.10, 0.20, 0.35][attacker.upgrades.corrosion] * 8;
          for (const otherLink of this.state.links) {
            if (otherLink.owner === attacker.id || otherLink.id === link.id) continue;
            // Only damage enemy links that also touch this core node
            if (otherLink.fromNodeId === targetCore.id || otherLink.toNodeId === targetCore.id) {
              otherLink.health -= splashDmg;
            }
          }
        }

        // Emit damage event (throttled)
        if (Math.random() < 0.15) {
          this.io.to(this.id).emit('game:playerDamaged', {
            playerId: coreOwner.id,
            health: coreOwner.health,
            maxHealth: coreOwner.maxHealth,
            attackerId: attacker.id,
            damage,
          });
        }
      }
    }

    // PROXIMITY DAMAGE — enemy nodes near your core deal passive damage
    // This prevents isolated players (no links) from being invincible
    for (const player of this.state.players) {
      if (!player.alive || player.invulnTimer > 0 || player.shieldActive) continue;
      const coreNode = nodeMap.get(player.coreNodeId);
      if (!coreNode) continue;

      let nearestEnemyDistSq = Infinity;
      let nearestEnemyOwner: string | null = null;
      for (const node of this.state.nodes) {
        if (!node.owner || node.owner === player.id || node.isCore) continue;
        const dx = node.position.x - coreNode.position.x;
        const dy = node.position.y - coreNode.position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestEnemyDistSq) {
          nearestEnemyDistSq = distSq;
          nearestEnemyOwner = node.owner;
        }
      }

      if (nearestEnemyDistSq < CORE_PROXIMITY_DAMAGE_RANGE * CORE_PROXIMITY_DAMAGE_RANGE) {
        attackedCores.add(player.id);
        const fortifyReduction = 1 - [0, 0.20, 0.35, 0.50][player.upgrades.fortify];
        const proximityDamage = CORE_PROXIMITY_DAMAGE * fortifyReduction * deltaTime;
        player.health -= proximityDamage;
        if (nearestEnemyOwner) player.lastDamagedBy = nearestEnemyOwner;
      }
    }

    // Health regen — only if NOT being attacked (uses precomputed set)
    for (const player of this.state.players) {
      if (!player.alive) continue;
      if (!attackedCores.has(player.id) && player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + HEALTH_REGEN_RATE * deltaTime);
      }
    }

    // Check eliminated players (health <= 0)
    for (const player of this.state.players) {
      if (!player.alive) continue;
      if (player.health <= 0) {
        player.health = 0;
        // Find the killer — the last player who damaged them
        let killer: Player | null = null;
        if (player.lastDamagedBy) {
          const _candidate = this.playerMap.get(player.lastDamagedBy);
          killer = (_candidate && _candidate.alive) ? _candidate : null;
        }
        // Fallback: find closest active enemy with links near their core
        if (!killer) {
          let bestEvidence = 0;
          for (const other of this.state.players) {
            if (other.id === player.id || !other.alive) continue;
            let evidence = 0;
            const nearbyPlayerNodes = this.state.nodes.filter(
              (n: GameNode) => n.owner === other.id
            );
            for (const node of nearbyPlayerNodes) {
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
        }
        this.eliminatePlayer(player, killer);
      }
    }

    // Clean old kill feed entries (older than 10 seconds) — mutate in place
    const cutoff = Date.now() - 10000;
    let writeIdx = 0;
    for (let i = 0; i < this.state.killFeed.length; i++) {
      if (this.state.killFeed[i].timestamp > cutoff) {
        this.state.killFeed[writeIdx++] = this.state.killFeed[i];
      }
    }
    this.state.killFeed.length = writeIdx;

    // ============ DYNAMIC MAP EVENTS ============
    this.eventTimer += deltaTime;
    this.state.nextEventIn = Math.max(0, this.eventInterval - this.eventTimer);

    if (this.eventTimer >= this.eventInterval) {
      this.eventTimer = 0;
      this.spawnMapEvent();
    }

    // Update active events
    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const evt = this.activeEvents[i];
      evt.remaining -= deltaTime;

      // Apply event effects
      this.applyEventEffect(evt, deltaTime);

      if (evt.remaining <= 0) {
        this.activeEvents.splice(i, 1);
        this.io.to(this.id).emit('game:mapEventEnded', { eventId: evt.id });
      }
    }
    // Reuse array instead of spreading
    this.state.mapEvents.length = 0;
    for (const evt of this.activeEvents) this.state.mapEvents.push(evt);

    // ============ TEAM SCORES ============
    if (this.gameMode === 'teams') {
      this.state.teamScores = [0, 0, 0, 0, 0];
      for (const player of this.state.players) {
        if (player.team > 0) {
          this.state.teamScores[player.team] += Math.floor(player.score);
        }
      }
    }

    // Build and emit slim state (strip server-only fields to reduce bandwidth)
    this.io.to(this.id).emit('game:state', this.buildClientState());
  }

  /** Build a lightweight copy of state for network transmission.
   *  Strips velocity, driftPhase/Speed/Amplitude, and server-internal player fields. */
  private _clientNodes: any[] = [];
  private _clientLinks: any[] = [];
  private _clientPlayers: any[] = [];
  private buildClientState(): any {
    // Reuse arrays
    this._clientNodes.length = 0;
    for (const n of this.state.nodes) {
      this._clientNodes.push({
        id: n.id,
        position: n.position,
        radius: n.radius,
        owner: n.owner,
        energy: n.energy,
        isCore: n.isCore,
        isPowerNode: n.isPowerNode,
        isMegaNode: n.isMegaNode,
        isGoldNode: n.isGoldNode,
        goldEnergy: n.goldEnergy,
        goldExpireTimer: n.goldExpireTimer,
        captureProgress: n.captureProgress,
        capturedBy: n.capturedBy,
        // velocity, driftPhase, driftSpeed, driftAmplitude stripped
      });
    }

    this._clientLinks.length = 0;
    for (const l of this.state.links) {
      this._clientLinks.push({
        id: l.id,
        fromNodeId: l.fromNodeId,
        toNodeId: l.toNodeId,
        owner: l.owner,
        health: l.health,
        maxHealth: l.maxHealth,
        shielded: l.shielded,
        // energyFlow stripped — client computes locally
      });
    }

    this._clientPlayers.length = 0;
    for (const p of this.state.players) {
      this._clientPlayers.push({
        id: p.id,
        name: p.name,
        color: p.color,
        energy: p.energy,
        health: p.health,
        maxHealth: p.maxHealth,
        coreNodeId: p.coreNodeId,
        nodeCount: p.nodeCount,
        linkCount: p.linkCount,
        alive: p.alive,
        score: p.score,
        killCount: p.killCount,
        deaths: p.deaths,
        killStreak: p.killStreak,
        respawnTimer: p.respawnTimer,
        invulnTimer: p.invulnTimer,
        combo: p.combo,
        comboTimer: p.comboTimer,
        abilityCooldowns: p.abilityCooldowns,
        team: p.team,
        upgrades: p.upgrades,
        clickStreak: p.clickStreak,
        clickStreakTimer: p.clickStreakTimer,
        bestStreak: p.bestStreak,
        nodesStolen: p.nodesStolen,
        longestChain: p.longestChain,
        peakNodeCount: p.peakNodeCount,
        shieldActive: p.shieldActive,
        // Stripped: lastKilledBy, lastDamagedBy, bestClickStreak,
        //          totalClicks, totalEnergyGenerated, assists
      });
    }

    return {
      nodes: this._clientNodes,
      links: this._clientLinks,
      players: this._clientPlayers,
      killFeed: this.state.killFeed,
      timeRemaining: this.state.timeRemaining,
      gamePhase: this.state.gamePhase,
      winner: this.state.winner,
      arenaWidth: this.state.arenaWidth,
      arenaHeight: this.state.arenaHeight,
      gameMode: this.state.gameMode,
      teamScores: this.state.teamScores,
      mapEvents: this.state.mapEvents,
      nextEventIn: this.state.nextEventIn,
    };
  }

  private endGame(): void {
    this.state.gamePhase = 'ended';

    if (this.tickInterval) {
      clearTimeout(this.tickInterval);
      this.tickInterval = null;
    }

    const sortedPlayers = [...this.state.players].sort((a: Player, b: Player) => {
      return b.score - a.score;
    });

    let winningTeam: number | undefined;

    if (this.gameMode === 'teams') {
      // In team mode, winning team is the one with highest combined score
      const team1Score = this.state.teamScores[1] || 0;
      const team2Score = this.state.teamScores[2] || 0;
      winningTeam = team1Score >= team2Score ? 1 : 2;
      // Winner is the top scorer on the winning team
      const teamWinner = sortedPlayers.find(p => p.team === winningTeam) || sortedPlayers[0];
      this.state.winner = teamWinner?.id || null;
    } else {
      const winner = sortedPlayers[0] || null;
      this.state.winner = winner?.id || null;
    }

    console.log(`[LINK.IO] GAME ENDED! Room ${this.code}`);
    console.log(`[LINK.IO] Scores: ${sortedPlayers.map((p: Player) => `${p.name}:${Math.floor(p.score)}`).join(', ')}`);

    // Calculate XP for each player — XP is HARD to earn
    for (const player of sortedPlayers) {
      let xp = 15; // tiny base XP for playing
      xp += Math.floor(player.score * 0.02); // only 2% of score becomes XP
      xp += player.killCount * 8; // kills give decent XP
      xp += Math.floor(player.bestStreak * 5); // streaks
      xp += Math.min(player.nodesStolen * 2, 20); // stealing nodes, capped
      if (this.gameMode === 'teams' && winningTeam && player.team === winningTeam) xp += 30;
      if (sortedPlayers[0]?.id === player.id) xp += 50; // winner bonus
      // Long game bonus (diminishing)
      const gameMins = Math.floor((GAME_DURATION - this.state.timeRemaining) / 60);
      xp += Math.min(gameMins * 3, 15);
      // Cap max XP per game so grinding feels slow
      xp = Math.min(xp, 150);

      const socket = this.sockets.get(player.id);
      socket?.emit('game:ended', {
        winner: sortedPlayers[0] || null,
        scores: sortedPlayers,
        winningTeam,
        xpGained: xp,
      });
    }

    this.io.to(this.id).emit('game:state', this.buildClientState());
  }

  // ============ DYNAMIC EVENTS SYSTEM ============

  private spawnMapEvent(): void {
    const types: Array<'energy_storm' | 'power_surge' | 'overcharge'> = [
      'energy_storm', 'power_surge', 'overcharge',
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    const margin = 400;
    const pos = {
      x: margin + Math.random() * (this.currentArenaWidth - margin * 2),
      y: margin + Math.random() * (this.currentArenaHeight - margin * 2),
    };

    const event: MapEvent = {
      id: uuidv4(),
      type,
      position: pos,
      radius: type === 'energy_storm' ? 400 : type === 'overcharge' ? 300 : 250,
      duration: type === 'energy_storm' ? 12 : 10,
      remaining: type === 'energy_storm' ? 12 : 10,
      intensity: 0.5 + Math.random() * 0.5,
    };

    this.activeEvents.push(event);
    this.io.to(this.id).emit('game:mapEvent', event);

    console.log(`[LINK.IO] MAP EVENT: ${type} at (${Math.floor(pos.x)}, ${Math.floor(pos.y)})`);
  }

  private applyEventEffect(event: MapEvent, deltaTime: number): void {
    switch (event.type) {
      case 'energy_storm': {
        // Nodes inside the storm generate 3x energy
        for (const node of this.state.nodes) {
          if (!node.owner) continue;
          const dx = node.position.x - event.position.x;
          const dy = node.position.y - event.position.y;
          if (Math.sqrt(dx * dx + dy * dy) < event.radius) {
            const player = this.state.players.find(p => p.id === node.owner);
            if (player) {
              player.energy += 4 * event.intensity * deltaTime;
              player.score += 1 * deltaTime;
            }
          }
        }
        break;
      }

      case 'power_surge': {
        // All links inside the zone deal 2x combat damage
        for (const link of this.state.links) {
          const fromNode = this.state.nodes.find(n => n.id === link.fromNodeId);
          if (!fromNode) continue;
          const dx = fromNode.position.x - event.position.x;
          const dy = fromNode.position.y - event.position.y;
          if (Math.sqrt(dx * dx + dy * dy) < event.radius) {
            // Boost link health for defenders
            if (link.owner) {
              link.health = Math.min(link.health + 5 * deltaTime, link.maxHealth);
            }
          }
        }
        break;
      }

      case 'overcharge': {
        // Players with nodes inside get faster cooldowns
        for (const player of this.state.players) {
          if (!player.alive) continue;
          const hasNodeInZone = this.state.nodes.some(n => {
            if (n.owner !== player.id) return false;
            const dx = n.position.x - event.position.x;
            const dy = n.position.y - event.position.y;
            return Math.sqrt(dx * dx + dy * dy) < event.radius;
          });
          if (hasNodeInZone) {
            for (const ab of ['surge', 'shield', 'emp', 'warp'] as AbilityType[]) {
              if (player.abilityCooldowns[ab] > 0) {
                player.abilityCooldowns[ab] = Math.max(
                  0,
                  player.abilityCooldowns[ab] - deltaTime * 2 * event.intensity
                );
              }
            }
            player.score += 0.5 * deltaTime;
          }
        }
        break;
      }

    }
  }

  // Calculate longest connected chain from a player's core — O(N+L) with adjacency list
  private _chainAdjacency = new Map<string, string[]>();
  private _chainVisited = new Set<string>();
  private _chainQueue: Array<{ id: string; depth: number }> = [];
  private calculateLongestChain(playerId: string): number {
    const adj = this._chainAdjacency;
    adj.clear();
    let coreId: string | null = null;
    let hasLinks = false;

    for (const n of this.state.nodes) {
      if (n.owner === playerId && n.isCore) coreId = n.id;
    }
    if (!coreId) return 1;

    for (const l of this.state.links) {
      if (l.owner !== playerId) continue;
      hasLinks = true;
      let fromList = adj.get(l.fromNodeId);
      if (!fromList) { fromList = []; adj.set(l.fromNodeId, fromList); }
      fromList.push(l.toNodeId);
      let toList = adj.get(l.toNodeId);
      if (!toList) { toList = []; adj.set(l.toNodeId, toList); }
      toList.push(l.fromNodeId);
    }
    if (!hasLinks) return 1;

    const visited = this._chainVisited;
    visited.clear();
    const queue = this._chainQueue;
    queue.length = 0;
    queue.push({ id: coreId, depth: 0 });
    visited.add(coreId);
    let maxDepth = 0;
    let head = 0;

    while (head < queue.length) {
      const { id, depth } = queue[head++];
      if (depth > maxDepth) maxDepth = depth;
      const neighbors = adj.get(id);
      if (!neighbors) continue;
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      }
    }

    return maxDepth + 1;
  }

  isEmpty(): boolean { return this.state.players.length === 0; }

  destroy(): void {
    if (this.tickInterval) { clearTimeout(this.tickInterval); this.tickInterval = null; }
    if (this.startTimeout) { clearTimeout(this.startTimeout); this.startTimeout = null; }
  }
}
