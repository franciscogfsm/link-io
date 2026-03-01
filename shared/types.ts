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
}

export interface GameState {
  nodes: GameNode[];
  links: GameLink[];
  players: Player[];
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
}
