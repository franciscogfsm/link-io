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
  owner: string | null; // player id or null for neutral
  energy: number;
  radius: number;
  isCore: boolean;
  isPowerNode: boolean; // special golden node, 3x energy
  isMegaNode: boolean;  // rare mega node, grants abilities
  driftPhase: number; // for anti-gravity sine motion
  driftSpeed: number;
  driftAmplitude: number;
}

export interface GameLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  owner: string;
  health: number; // 0-100
  maxHealth: number;
  energyFlow: number; // energy per second flowing through
  shielded: boolean; // protected from damage
}

export type AbilityType = 'surge' | 'shield' | 'emp';

export interface AbilityCooldown {
  surge: number;   // seconds remaining
  shield: number;
  emp: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  energy: number;
  coreNodeId: string;
  nodeCount: number;
  linkCount: number;
  alive: boolean;
  score: number;        // cumulative score for ranking
  killCount: number;    // nodes stolen from enemies
  combo: number;        // current link combo
  comboTimer: number;   // seconds until combo resets
  abilityCooldowns: AbilityCooldown;
}

export interface KillFeedEntry {
  id: string;
  killer: string;      // player name
  killerColor: string;
  victim: string;      // player name
  victimColor: string;
  action: string;      // "stole 3 nodes from", "eliminated", "destroyed link of"
  timestamp: number;
}

export interface GameState {
  nodes: GameNode[];
  links: GameLink[];
  players: Player[];
  killFeed: KillFeedEntry[];
  timeRemaining: number; // seconds
  gamePhase: 'waiting' | 'playing' | 'ended';
  winner: string | null; // player id
  arenaWidth: number;
  arenaHeight: number;
}

export interface RoomInfo {
  id: string;
  code: string;
  playerCount: number;
  maxPlayers: number;
  gamePhase: string;
}

// ============================================================
// Socket Events
// ============================================================

export interface ClientToServerEvents {
  'player:join': (data: { name: string; roomCode?: string }) => void;
  'player:createRoom': (data: { name: string }) => void;
  'player:ready': () => void;
  'game:createLink': (data: { fromNodeId: string; toNodeId: string }) => void;
  'game:destroyLink': (data: { linkId: string }) => void;
  'game:claimNode': (data: { nodeId: string }) => void;
  'game:useAbility': (data: { ability: AbilityType }) => void;
  'game:emote': (data: { emote: string }) => void;
}

export interface ServerToClientEvents {
  'room:joined': (data: { roomId: string; roomCode: string; playerId: string }) => void;
  'room:playerJoined': (data: { player: Player }) => void;
  'room:playerLeft': (data: { playerId: string }) => void;
  'room:error': (data: { message: string }) => void;
  'game:state': (state: GameState) => void;
  'game:started': (state: GameState) => void;
  'game:ended': (data: { winner: Player | null; scores: Player[] }) => void;
  'game:linkCreated': (link: GameLink) => void;
  'game:linkDestroyed': (data: { linkId: string; reason: string }) => void;
  'game:nodesClaimed': (data: { nodeIds: string[]; owner: string | null }) => void;
  'game:networkCollapsed': (data: { nodeIds: string[]; playerId: string }) => void;
  'game:error': (data: { message: string }) => void;
  'game:killFeed': (entry: KillFeedEntry) => void;
  'game:abilityUsed': (data: { playerId: string; ability: AbilityType; targetNodes: string[] }) => void;
  'game:combo': (data: { playerId: string; combo: number; bonusEnergy: number }) => void;
  'game:emote': (data: { playerId: string; emote: string; position: Vec2 }) => void;
  'game:screenShake': (data: { intensity: number; duration: number }) => void;
}
