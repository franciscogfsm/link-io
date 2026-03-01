// ============================================================
// LINK.IO Client - Player Color Palette
// ============================================================

export const PLAYER_COLORS = [
  { main: '#00f0ff', glow: 'rgba(0,240,255,0.5)', dark: '#006677' },
  { main: '#ff006e', glow: 'rgba(255,0,110,0.5)', dark: '#770033' },
  { main: '#39ff14', glow: 'rgba(57,255,20,0.5)', dark: '#1a7a0a' },
  { main: '#ffbe0b', glow: 'rgba(255,190,11,0.5)', dark: '#7a5c00' },
  { main: '#8338ec', glow: 'rgba(131,56,236,0.5)', dark: '#3d1a70' },
  { main: '#ff5400', glow: 'rgba(255,84,0,0.5)', dark: '#7a2800' },
  { main: '#00b4d8', glow: 'rgba(0,180,216,0.5)', dark: '#005566' },
  { main: '#e5383b', glow: 'rgba(229,56,59,0.5)', dark: '#701b1c' },
];

export function getPlayerColor(hex: string) {
  const entry = PLAYER_COLORS.find((c) => c.main === hex);
  return entry || { main: hex, glow: hex + '80', dark: hex + '44' };
}

export const NEUTRAL_COLOR = { main: '#334466', glow: 'rgba(51,68,102,0.3)', dark: '#1a2233' };
