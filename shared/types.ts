// ============================================================
// LINK.IO - Shared Types
// Used by both client and server
// ============================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface GameNode {
  id: string;
  position: Vec2;
  velocity: Vec2;
  owner: string | null;
  energy: number;
  radius: number;
  isCore: boolean;
  isPowerNode: boolean;
  isMegaNode: boolean;
  isGoldNode: boolean;        // gold nodes: click to harvest for bonus energy
  goldEnergy: number;         // remaining gold energy to harvest
  goldExpireTimer: number;    // seconds until gold node despawns
  driftPhase: number;
  driftSpeed: number;
  driftAmplitude: number;
  captureProgress?: number;
  capturedBy?: string | null;
}

export interface GameLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  owner: string;
  health: number;
  maxHealth: number;
  energyFlow: number;
  shielded: boolean;
}

export type AbilityType = 'surge' | 'shield' | 'emp';

// ============================================================
// UPGRADE SYSTEM — 12 upgrades across 4 categories
// ============================================================
export type UpgradeType =
  // DEFENSE
  | 'fortify'       // core takes less damage
  | 'regen'         // health regen speed
  | 'thornAura'     // damage attackers back
  // OFFENSE
  | 'power'         // link damage
  | 'siphon'        // steal more energy
  | 'corrosion'     // links do AoE to nearby enemy links
  // ECONOMY
  | 'flow'          // energy generation
  | 'efficiency'    // link creation costs less
  | 'magnet'        // auto-collect nearby neutral nodes
  // UTILITY
  | 'reach'         // link range
  | 'toughLinks'    // link HP
  | 'speed';        // movement speed + less energy drain

export const UPGRADE_MAX_TIER = 3;
export const UPGRADE_COSTS: Record<UpgradeType, number[]> = {
  // DEFENSE
  fortify:    [50,  100, 180],
  regen:      [40,  90,  160],
  thornAura:  [70,  130, 220],
  // OFFENSE
  power:      [60,  120, 200],
  siphon:     [50,  100, 170],
  corrosion:  [80,  150, 250],
  // ECONOMY
  flow:       [40,  80,  150],
  efficiency: [35,  75,  140],
  magnet:     [60,  110, 190],
  // UTILITY
  reach:      [45,  90,  160],
  toughLinks: [50,  100, 170],
  speed:      [55,  105, 180],
};
export const UPGRADE_LABELS: Record<UpgradeType, string> = {
  fortify: 'FORTIFY',
  regen: 'REGEN',
  thornAura: 'THORNS',
  power: 'POWER',
  siphon: 'SIPHON',
  corrosion: 'CORRODE',
  flow: 'FLOW',
  efficiency: 'THRIFTY',
  magnet: 'MAGNET',
  reach: 'REACH',
  toughLinks: 'ARMOR',
  speed: 'SPEED',
};
export const UPGRADE_DESCRIPTIONS: Record<UpgradeType, string[]> = {
  fortify:    ['Core -20% dmg', 'Core -35% dmg', 'Core -50% dmg'],
  regen:      ['+50% HP regen', '+100% HP regen', '+200% HP regen'],
  thornAura:  ['Reflect 15% dmg', 'Reflect 30% dmg', 'Reflect 50% dmg'],
  power:      ['+25% link dmg', '+50% link dmg', '+80% link dmg'],
  siphon:     ['+40% siphon', '+80% siphon', '+150% siphon'],
  corrosion:  ['AoE 10% splash', 'AoE 20% splash', 'AoE 35% splash'],
  flow:       ['+30% energy', '+60% energy', '+100% energy'],
  efficiency: ['-20% link cost', '-35% link cost', '-50% link cost'],
  magnet:     ['Auto-grab 150px', 'Auto-grab 250px', 'Auto-grab 400px'],
  reach:      ['+15% range', '+30% range', '+50% range'],
  toughLinks: ['+30% link HP', '+60% link HP', '+100% link HP'],
  speed:      ['+20% speed', '+40% speed', '+70% speed'],
};

export const UPGRADE_CATEGORIES: Record<string, UpgradeType[]> = {
  'DEFENSE': ['fortify', 'regen', 'thornAura'],
  'OFFENSE': ['power', 'siphon', 'corrosion'],
  'ECONOMY': ['flow', 'efficiency', 'magnet'],
  'UTILITY': ['reach', 'toughLinks', 'speed'],
};

export const UPGRADE_ICONS: Record<UpgradeType, string> = {
  fortify: '🛡',
  regen: '💚',
  thornAura: '🌵',
  power: '⚔',
  siphon: '🧲',
  corrosion: '☣',
  flow: '⚡',
  efficiency: '💰',
  magnet: '🧲',
  reach: '📡',
  toughLinks: '🔗',
  speed: '💨',
};

export interface PlayerUpgrades {
  fortify: number;
  regen: number;
  thornAura: number;
  power: number;
  siphon: number;
  corrosion: number;
  flow: number;
  efficiency: number;
  magnet: number;
  reach: number;
  toughLinks: number;
  speed: number;
}

export const DEFAULT_UPGRADES: PlayerUpgrades = {
  fortify: 0, regen: 0, thornAura: 0,
  power: 0, siphon: 0, corrosion: 0,
  flow: 0, efficiency: 0, magnet: 0,
  reach: 0, toughLinks: 0, speed: 0,
};

export interface AbilityCooldown {
  surge: number;
  shield: number;
  emp: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  energy: number;
  health: number;         // current HP (0 = eliminated)
  maxHealth: number;      // max HP
  coreNodeId: string;
  nodeCount: number;
  linkCount: number;
  alive: boolean;
  score: number;
  killCount: number;
  deaths: number;
  killStreak: number;
  bestStreak: number;
  respawnTimer: number;
  invulnTimer: number;
  lastKilledBy: string | null;
  lastDamagedBy: string | null; // last player who dealt damage
  combo: number;
  comboTimer: number;
  abilityCooldowns: AbilityCooldown;
  team: number;           // team index (0 = no team / FFA)
  assists: number;        // assist count
  nodesStolen: number;    // total nodes captured from enemies
  longestChain: number;   // longest chain of connected nodes
  totalEnergyGenerated: number; // lifetime energy generated
  upgrades: PlayerUpgrades;     // in-match upgrade tiers
  clickStreak: number;          // current rapid-click streak count
  clickStreakTimer: number;     // time left before streak resets
  bestClickStreak: number;      // highest click streak this game
  totalClicks: number;          // total clicks this game
}

export interface KillFeedEntry {
  id: string;
  killer: string;
  killerColor: string;
  victim: string;
  victimColor: string;
  action: string;
  timestamp: number;
}

// Dynamic map events
export type MapEventType = 'energy_storm' | 'power_surge' | 'overcharge';

export interface MapEvent {
  id: string;
  type: MapEventType;
  position: Vec2;
  radius: number;
  duration: number;      // total seconds
  remaining: number;     // seconds left
  intensity: number;     // 0-1 strength
}

export type GameMode = 'ffa' | 'teams';

export interface GameState {
  nodes: GameNode[];
  links: GameLink[];
  players: Player[];
  killFeed: KillFeedEntry[];
  timeRemaining: number;
  gamePhase: 'waiting' | 'playing' | 'ended';
  winner: string | null;  // player or team id
  arenaWidth: number;
  arenaHeight: number;
  gameMode: GameMode;
  teamScores: number[];   // scores per team (index = team number, 0=unused)
  mapEvents: MapEvent[];  // active dynamic events
  nextEventIn: number;    // seconds until next event
}

export interface RoomInfo {
  id: string;
  code: string;
  playerCount: number;
  maxPlayers: number;
  gamePhase: string;
}

// ============================================================
// Lobby & Queue
// ============================================================

export interface LobbyInfo {
  code: string;
  gameMode: GameMode;
  hostName: string;
  players: { id: string; name: string; team: number; ready: boolean }[];
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'in-game';
}

// ============================================================
// XP & Progression (persisted in localStorage on client)
// ============================================================

export interface PlayerProgression {
  xp: number;
  level: number;
  gamesPlayed: number;
  totalKills: number;
  totalWins: number;
  bestStreak: number;
  longestGame: number;
  titles: string[]; // unlocked titles
  currentTitle: string;
}

export const XP_PER_LEVEL = 500;
export const LEVEL_TITLES: [number, string][] = [
  [1, 'Newcomer'],
  [3, 'Node Runner'],
  [5, 'Link Master'],
  [8, 'Network Architect'],
  [12, 'Grid Commander'],
  [15, 'Cyber Warlord'],
  [20, 'Singularity'],
  [25, 'Digital God'],
  [30, 'TRANSCENDED'],
];

// ============================================================
// Socket Events
// ============================================================

export interface ClientToServerEvents {
  'player:join': (data: { name: string; roomCode?: string; gameMode?: GameMode }) => void;
  'player:createRoom': (data: { name: string; gameMode?: GameMode }) => void;
  'player:ready': () => void;
  'player:requestPlayerCount': () => void;
  'lobby:setTeam': (data: { team: number }) => void;
  'lobby:toggleReady': () => void;
  'lobby:startGame': () => void;
  'game:move': (data: { direction: { x: number; y: number } }) => void;
  'game:createLink': (data: { fromNodeId: string; toNodeId: string }) => void;
  'game:destroyLink': (data: { linkId: string }) => void;
  'game:claimNode': (data: { nodeId: string }) => void;
  'game:useAbility': (data: { ability: AbilityType }) => void;
  'game:upgrade': (data: { upgrade: UpgradeType }) => void;
  'game:clickNode': (data: { nodeId: string }) => void;
  'game:emote': (data: { emote: string }) => void;
}

export interface ServerToClientEvents {
  'server:playerCount': (data: { players: number; rooms: number }) => void;
  'room:joined': (data: { roomId: string; roomCode: string; playerId: string }) => void;
  'room:playerJoined': (data: { player: Player }) => void;
  'room:playerLeft': (data: { playerId: string }) => void;
  'room:error': (data: { message: string }) => void;
  'lobby:update': (data: LobbyInfo) => void;
  'lobby:countdown': (data: { seconds: number }) => void;
  'queue:status': (data: { position: number; playersNeeded: number; message: string }) => void;
  'game:state': (state: GameState) => void;
  'game:started': (state: GameState) => void;
  'game:ended': (data: { winner: Player | null; scores: Player[]; winningTeam?: number; xpGained?: number }) => void;
  'game:linkCreated': (link: GameLink) => void;
  'game:linkDestroyed': (data: { linkId: string; reason: string }) => void;
  'game:nodesClaimed': (data: { nodeIds: string[]; owner: string | null }) => void;
  'game:networkCollapsed': (data: { nodeIds: string[]; playerId: string }) => void;
  'game:error': (data: { message: string }) => void;
  'game:killFeed': (entry: KillFeedEntry) => void;
  'game:abilityUsed': (data: { playerId: string; ability: AbilityType; targetNodes: string[] }) => void;
  'game:upgraded': (data: { playerId: string; upgrade: UpgradeType; tier: number }) => void;
  'game:clickReward': (data: { playerId: string; nodeId: string; energy: number; streak: number; message: string }) => void;
  'game:combo': (data: { playerId: string; combo: number; bonusEnergy: number }) => void;
  'game:emote': (data: { playerId: string; emote: string; position: Vec2 }) => void;
  'game:screenShake': (data: { intensity: number; duration: number }) => void;
  'game:playerEliminated': (data: {
    victimId: string; killerId: string | null;
    killerStreak: number; isRevenge: boolean;
    victimPosition: Vec2;
  }) => void;
  'game:playerRespawned': (data: { playerId: string; coreNodeId: string; position: Vec2 }) => void;
  'game:playerDamaged': (data: { playerId: string; health: number; maxHealth: number; attackerId: string; damage: number }) => void;
  'game:killStreak': (data: { playerId: string; streak: number; label: string }) => void;
  'game:mapEvent': (event: MapEvent) => void;
  'game:mapEventEnded': (data: { eventId: string }) => void;
  'game:nodeStolen': (data: { nodeId: string; from: string; to: string; position: Vec2 }) => void;
}
