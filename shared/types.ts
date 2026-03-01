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

export type AbilityType = 'surge' | 'shield' | 'emp' | 'warp';

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
  fortify:    [120, 280, 500],
  regen:      [100, 240, 450],
  thornAura:  [150, 350, 600],
  // OFFENSE
  power:      [110, 260, 480],
  siphon:     [110, 260, 480],
  corrosion:  [180, 400, 700],
  // ECONOMY
  flow:       [100, 250, 460],
  efficiency: [80,  200, 380],
  magnet:     [250, 500, 800],
  // UTILITY
  reach:      [100, 240, 440],
  toughLinks: [110, 260, 480],
  speed:      [120, 280, 500],
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
  flow:       ['+8% energy', '+15% energy', '+25% energy'],
  efficiency: ['-20% link cost', '-35% link cost', '-50% link cost'],
  magnet:     ['Auto-grab 100px', 'Auto-grab 160px', 'Auto-grab 220px'],
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
  warp: number;
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
  peakNodeCount: number;  // highest node count achieved
  upgrades: PlayerUpgrades;     // in-match upgrade tiers
  clickStreak: number;          // current rapid-click streak count
  clickStreakTimer: number;     // time left before streak resets
  bestClickStreak: number;      // highest click streak this game
  totalClicks: number;          // total clicks this game
  shieldActive: boolean;        // GUARD ability active — full protection
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
  hostId: string;
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
  equippedSkin: string;
  equippedPet: string;
  equippedTrail: string;
  equippedBorder: string;
  equippedDeathEffect: string;
  unlockedCosmetics: string[]; // ids of unlocked cosmetics
  // Currency & gambling
  coins: number;
  totalCoinsEarned: number;
  boxesOpened: number;
  // Pity system — guaranteed epic/legendary after N misses
  pityCounter: number; // increments each box without epic+
  // Daily reward streak
  dailyStreak: number;
  lastDailyClaimDate: string; // ISO date string "YYYY-MM-DD"
  totalDailysClaimed: number;
}

// ============ LINK CONVERGENCE — multiple links to one node = more power ============
// When multiple links from the same player connect to a single node,
// that node becomes a convergence point with bonus power.
// Formula: logarithmic scaling so 2 links = 1.5x, 3 = ~1.8x, 4 = 2.0x, etc.
export function convergenceMultiplier(linkCount: number): number {
  if (linkCount <= 1) return 1;
  return 1 + Math.log2(linkCount) * 0.5;
}

// XP is HARD to earn — scaling per level
export const XP_PER_LEVEL = 800;  // base XP per level
export const XP_LEVEL_SCALING = 1.15;  // each level requires 15% more
export function xpForLevel(level: number): number {
  // Total XP needed to reach this level
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(XP_PER_LEVEL * Math.pow(XP_LEVEL_SCALING, i - 1));
  }
  return total;
}
export function xpToNextLevel(level: number): number {
  return Math.floor(XP_PER_LEVEL * Math.pow(XP_LEVEL_SCALING, level - 1));
}
export function getLevelFromXP(totalXP: number): number {
  let level = 1;
  let xpNeeded = 0;
  while (true) {
    const cost = Math.floor(XP_PER_LEVEL * Math.pow(XP_LEVEL_SCALING, level - 1));
    if (xpNeeded + cost > totalXP) break;
    xpNeeded += cost;
    level++;
  }
  return level;
}

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
  [40, 'BEYOND'],
  [50, 'ETERNAL'],
];

// ============================================================
// COSMETICS & UNLOCKABLES
// ============================================================

export type CosmeticType = 'skin' | 'pet' | 'trail' | 'border' | 'deathEffect';
export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface CosmeticItem {
  id: string;
  name: string;
  type: CosmeticType;
  description: string;
  rarity: CosmeticRarity;
  // How to obtain: 'level' = auto-unlock at level, 'box' = loot box only, 'both' = either
  source: 'level' | 'box' | 'both';
  levelRequired: number; // 0 if box-only
}

export const RARITY_COLORS: Record<CosmeticRarity, string> = {
  common: '#8a8a8a',
  uncommon: '#39ff14',
  rare: '#00c8ff',
  epic: '#b44aff',
  legendary: '#ffd700',
  mythic: '#ff2060',
};

export const RARITY_LABELS: Record<CosmeticRarity, string> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
  mythic: 'MYTHIC',
};

// ============================================================
// LOOT BOX SYSTEM
// ============================================================

export interface LootBoxTier {
  id: string;
  name: string;
  cost: number;
  description: string;
  color: string;
  // Drop rates (must sum to 1.0)
  rates: Record<CosmeticRarity, number>;
}

export const LOOT_BOXES: LootBoxTier[] = [
  {
    id: 'box_standard',
    name: 'STANDARD CRATE',
    cost: 100,
    description: 'Basic drop crate',
    color: '#6a6a8a',
    rates: { common: 0.50, uncommon: 0.28, rare: 0.14, epic: 0.06, legendary: 0.018, mythic: 0.002 },
  },
  {
    id: 'box_premium',
    name: 'PREMIUM CRATE',
    cost: 300,
    description: 'Higher rarity odds',
    color: '#b44aff',
    rates: { common: 0.25, uncommon: 0.30, rare: 0.25, epic: 0.13, legendary: 0.06, mythic: 0.01 },
  },
  {
    id: 'box_ultra',
    name: 'ULTRA CRATE',
    cost: 750,
    description: 'Guaranteed rare or above',
    color: '#ffd700',
    rates: { common: 0, uncommon: 0, rare: 0.50, epic: 0.30, legendary: 0.15, mythic: 0.05 },
  },
];

// Pity system: after this many opens without epic+, guaranteed epic
export const PITY_THRESHOLD = 15;
// After this many without legendary+, guaranteed legendary
export const LEGENDARY_PITY = 40;

// ============================================================
// DAILY REWARDS
// ============================================================

export interface DailyReward {
  day: number;       // 1-7 (repeats)
  coins: number;
  bonusLabel: string; // what the user sees
}

export const DAILY_REWARDS: DailyReward[] = [
  { day: 1, coins: 50,  bonusLabel: '50 Coins' },
  { day: 2, coins: 75,  bonusLabel: '75 Coins' },
  { day: 3, coins: 100, bonusLabel: '100 Coins' },
  { day: 4, coins: 150, bonusLabel: '150 Coins + Standard Crate' },
  { day: 5, coins: 200, bonusLabel: '200 Coins' },
  { day: 6, coins: 300, bonusLabel: '300 Coins' },
  { day: 7, coins: 500, bonusLabel: '500 Coins + Premium Crate' },
];

// ============================================================
// COIN EARNING RATES (server calculates, client displays)
// ============================================================

export const COIN_REWARDS = {
  BASE_PER_GAME: 10,
  PER_KILL: 8,
  PER_100_SCORE: 3,
  WIN_BONUS: 40,
  STREAK_3_BONUS: 15,
  STREAK_5_BONUS: 30,
  FIRST_GAME_OF_DAY: 25,
};

export const ALL_COSMETICS: CosmeticItem[] = [
  // ======== SKINS (core node appearance) ========
  { id: 'skin_default',      name: 'Standard',          type: 'skin', description: 'Default core look',                      rarity: 'common',    source: 'level', levelRequired: 1 },
  { id: 'skin_hexagon',      name: 'Hexagon',           type: 'skin', description: 'Hexagonal core shape',                   rarity: 'common',    source: 'level', levelRequired: 3 },
  { id: 'skin_diamond',      name: 'Diamond',           type: 'skin', description: 'Diamond-shaped core',                    rarity: 'uncommon',  source: 'level', levelRequired: 5 },
  { id: 'skin_star',         name: 'Starborn',          type: 'skin', description: 'Star-shaped pulsing core',               rarity: 'uncommon',  source: 'level', levelRequired: 8 },
  { id: 'skin_pulse',        name: 'Pulse Ring',        type: 'skin', description: 'Radiating pulse rings',                  rarity: 'rare',      source: 'level', levelRequired: 12 },
  { id: 'skin_void',         name: 'Void Core',         type: 'skin', description: 'Dark matter swirling core',              rarity: 'rare',      source: 'level', levelRequired: 16 },
  { id: 'skin_plasma',       name: 'Plasma',            type: 'skin', description: 'Crackling plasma energy',                rarity: 'epic',      source: 'level', levelRequired: 20 },
  { id: 'skin_galaxy',       name: 'Galaxy',            type: 'skin', description: 'Miniature galaxy spins inside',          rarity: 'epic',      source: 'level', levelRequired: 25 },
  { id: 'skin_phoenix',      name: 'Phoenix',           type: 'skin', description: 'Fiery rebirth aura',                     rarity: 'legendary', source: 'level', levelRequired: 30 },
  { id: 'skin_glitch',       name: 'GLITCH',            type: 'skin', description: 'Reality-breaking distortion',            rarity: 'legendary', source: 'level', levelRequired: 40 },
  { id: 'skin_omega',        name: 'OMEGA',             type: 'skin', description: 'The ultimate core skin',                 rarity: 'legendary', source: 'level', levelRequired: 50 },
  // Box-exclusive skins
  { id: 'skin_neon_skull',   name: 'Neon Skull',        type: 'skin', description: 'Glowing skull-shaped core',              rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'skin_binary',       name: 'Binary',            type: 'skin', description: 'Cascading 0s and 1s',                    rarity: 'rare',      source: 'box',   levelRequired: 0 },
  { id: 'skin_shatter',      name: 'Shattered',         type: 'skin', description: 'Fractured glass core',                   rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'skin_singularity',  name: 'Singularity',       type: 'skin', description: 'Warping spacetime core',                 rarity: 'legendary', source: 'box',   levelRequired: 0 },
  { id: 'skin_chromatic',    name: 'Chromatic',         type: 'skin', description: 'Shifts through all colors',              rarity: 'mythic',    source: 'box',   levelRequired: 0 },
  { id: 'skin_divine',       name: 'Divine Radiance',   type: 'skin', description: 'Blinding white-gold energy',             rarity: 'mythic',    source: 'box',   levelRequired: 0 },

  // ======== PETS (orbit core) ========
  { id: 'pet_none',          name: 'No Pet',            type: 'pet',  description: 'No pet equipped',                        rarity: 'common',    source: 'level', levelRequired: 1 },
  { id: 'pet_orb',           name: 'Spark Orb',         type: 'pet',  description: 'Tiny glowing orb follows you',           rarity: 'common',    source: 'level', levelRequired: 4 },
  { id: 'pet_cube',          name: 'Holo Cube',         type: 'pet',  description: 'Rotating holographic cube',              rarity: 'uncommon',  source: 'level', levelRequired: 7 },
  { id: 'pet_drone',         name: 'Mini Drone',        type: 'pet',  description: 'Buzzing little drone buddy',             rarity: 'uncommon',  source: 'level', levelRequired: 10 },
  { id: 'pet_skull',         name: 'Ghost Skull',       type: 'pet',  description: 'Spectral skull orbits you',              rarity: 'rare',      source: 'level', levelRequired: 14 },
  { id: 'pet_star',          name: 'Star Fragment',     type: 'pet',  description: 'Twinkling star shard',                   rarity: 'rare',      source: 'level', levelRequired: 18 },
  { id: 'pet_dragon',        name: 'Pixel Dragon',      type: 'pet',  description: 'Tiny dragon circles your core',          rarity: 'epic',      source: 'level', levelRequired: 22 },
  { id: 'pet_eye',           name: 'All-Seeing Eye',    type: 'pet',  description: 'Watching... always watching',            rarity: 'epic',      source: 'level', levelRequired: 28 },
  { id: 'pet_blackhole',     name: 'Black Hole',        type: 'pet',  description: 'Miniature singularity',                  rarity: 'legendary', source: 'level', levelRequired: 35 },
  { id: 'pet_crown',         name: 'Royal Crown',       type: 'pet',  description: 'Floating golden crown',                  rarity: 'legendary', source: 'level', levelRequired: 45 },
  // Box-exclusive pets
  { id: 'pet_ghost',         name: 'Phantom',           type: 'pet',  description: 'Flickering ghost companion',             rarity: 'rare',      source: 'box',   levelRequired: 0 },
  { id: 'pet_butterfly',     name: 'Neon Butterfly',    type: 'pet',  description: 'Electric butterfly orbits you',          rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'pet_serpent',       name: 'Cyber Serpent',      type: 'pet',  description: 'Coiling digital snake',                  rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'pet_phoenix_bird',  name: 'Phoenix Hatchling', type: 'pet',  description: 'Baby phoenix in flames',                 rarity: 'legendary', source: 'box',   levelRequired: 0 },
  { id: 'pet_void_entity',   name: 'Void Entity',       type: 'pet',  description: 'Shifting dark matter creature',          rarity: 'mythic',    source: 'box',   levelRequired: 0 },

  // ======== TRAILS (movement particles) ========
  { id: 'trail_none',        name: 'No Trail',          type: 'trail', description: 'No trail effect',                       rarity: 'common',    source: 'level', levelRequired: 1 },
  { id: 'trail_spark',       name: 'Sparks',            type: 'trail', description: 'Small spark particles',                 rarity: 'common',    source: 'level', levelRequired: 3 },
  { id: 'trail_smoke',       name: 'Smoke',             type: 'trail', description: 'Wispy smoke trail',                     rarity: 'uncommon',  source: 'level', levelRequired: 6 },
  { id: 'trail_fire',        name: 'Fire Trail',        type: 'trail', description: 'Blazing fire behind you',               rarity: 'uncommon',  source: 'level', levelRequired: 11 },
  { id: 'trail_rainbow',     name: 'Prismatic',         type: 'trail', description: 'Rainbow chromatic trail',               rarity: 'rare',      source: 'level', levelRequired: 15 },
  { id: 'trail_lightning',   name: 'Lightning',         type: 'trail', description: 'Electric bolts trail',                  rarity: 'rare',      source: 'level', levelRequired: 19 },
  { id: 'trail_ice',         name: 'Frost',             type: 'trail', description: 'Icy crystalline particles',             rarity: 'epic',      source: 'level', levelRequired: 24 },
  { id: 'trail_void',        name: 'Void Wake',         type: 'trail', description: 'Dark matter distortion',                rarity: 'epic',      source: 'level', levelRequired: 32 },
  { id: 'trail_galaxy',      name: 'Stardust',          type: 'trail', description: 'Cosmic stardust particles',             rarity: 'legendary', source: 'level', levelRequired: 42 },
  // Box-exclusive trails
  { id: 'trail_glitch',      name: 'Glitch Trail',      type: 'trail', description: 'Pixelated distortion wake',             rarity: 'rare',      source: 'box',   levelRequired: 0 },
  { id: 'trail_sakura',      name: 'Cherry Blossom',    type: 'trail', description: 'Falling pink petals',                   rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'trail_plasma_trail', name: 'Plasma Stream',    type: 'trail', description: 'Crackling energy stream',               rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'trail_celestial',   name: 'Celestial',         type: 'trail', description: 'Orbiting stars and moons',              rarity: 'legendary', source: 'box',   levelRequired: 0 },
  { id: 'trail_oblivion',    name: 'Oblivion',          type: 'trail', description: 'Reality tears apart behind you',        rarity: 'mythic',    source: 'box',   levelRequired: 0 },

  // ======== BORDERS (core ring effects) ========
  { id: 'border_none',       name: 'No Border',         type: 'border', description: 'Default border',                       rarity: 'common',    source: 'level', levelRequired: 1 },
  { id: 'border_thin',       name: 'Sharp Ring',        type: 'border', description: 'Thin bright ring',                     rarity: 'common',    source: 'level', levelRequired: 2 },
  { id: 'border_double',     name: 'Double Ring',       type: 'border', description: 'Two concentric rings',                 rarity: 'uncommon',  source: 'level', levelRequired: 6 },
  { id: 'border_dashed',     name: 'Dashed',            type: 'border', description: 'Rotating dashed border',               rarity: 'uncommon',  source: 'level', levelRequired: 9 },
  { id: 'border_gear',       name: 'Gear Ring',         type: 'border', description: 'Spinning gear teeth border',           rarity: 'rare',      source: 'level', levelRequired: 13 },
  { id: 'border_flame',      name: 'Flame Halo',        type: 'border', description: 'Fiery animated border',                rarity: 'rare',      source: 'level', levelRequired: 17 },
  { id: 'border_pulse',      name: 'Pulse Wave',        type: 'border', description: 'Pulsating wave ring',                  rarity: 'epic',      source: 'level', levelRequired: 23 },
  { id: 'border_holo',       name: 'Holographic',       type: 'border', description: 'Shifting holographic ring',            rarity: 'epic',      source: 'level', levelRequired: 33 },
  { id: 'border_divine',     name: 'Divine Aura',       type: 'border', description: 'Golden divine radiance',               rarity: 'legendary', source: 'level', levelRequired: 48 },
  // Box-exclusive borders
  { id: 'border_circuit',    name: 'Circuit Board',     type: 'border', description: 'Digital circuit patterns',             rarity: 'rare',      source: 'box',   levelRequired: 0 },
  { id: 'border_thorns',     name: 'Thorns',            type: 'border', description: 'Sharp thorny ring',                    rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'border_eclipse',    name: 'Eclipse',           type: 'border', description: 'Solar eclipse corona',                 rarity: 'legendary', source: 'box',   levelRequired: 0 },
  { id: 'border_void_ring',  name: 'Void Ring',         type: 'border', description: 'Pulsing dark matter ring',             rarity: 'mythic',    source: 'box',   levelRequired: 0 },

  // ======== DEATH EFFECTS (play when you eliminate someone) ========
  { id: 'death_default',     name: 'Standard',          type: 'deathEffect', description: 'Default elimination burst',       rarity: 'common',    source: 'level', levelRequired: 1 },
  { id: 'death_shatter',     name: 'Shatter',           type: 'deathEffect', description: 'Glass shattering effect',         rarity: 'uncommon',  source: 'level', levelRequired: 5 },
  { id: 'death_vaporize',    name: 'Vaporize',          type: 'deathEffect', description: 'Target dissolves into particles', rarity: 'rare',      source: 'level', levelRequired: 15 },
  { id: 'death_implode',     name: 'Implosion',         type: 'deathEffect', description: 'Black hole implosion',            rarity: 'epic',      source: 'level', levelRequired: 25 },
  { id: 'death_lightning',   name: 'Lightning Strike',  type: 'deathEffect', description: 'Lightning bolt destroys target',  rarity: 'legendary', source: 'level', levelRequired: 38 },
  // Box-exclusive death effects
  { id: 'death_pixel',       name: 'Pixel Death',       type: 'deathEffect', description: 'Retro pixel explosion',           rarity: 'rare',      source: 'box',   levelRequired: 0 },
  { id: 'death_fireworks',   name: 'Fireworks',         type: 'deathEffect', description: 'Celebratory fireworks burst',     rarity: 'epic',      source: 'box',   levelRequired: 0 },
  { id: 'death_supernova',   name: 'Supernova',         type: 'deathEffect', description: 'Massive star explosion',          rarity: 'legendary', source: 'box',   levelRequired: 0 },
  { id: 'death_erasure',     name: 'Erasure',           type: 'deathEffect', description: 'Deleted from existence',          rarity: 'mythic',    source: 'box',   levelRequired: 0 },
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
  'game:useAbility': (data: { ability: AbilityType; targetNodeId?: string }) => void;
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
  'game:ended': (data: { winner: Player | null; scores: Player[]; winningTeam?: number; xpGained?: number; coinsGained?: number }) => void;
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
