// ============================================================
// LINK.IO Client - HUD Component
// Energy meter, timer, node/link counts, room code
// ============================================================

import type { Player, GameState } from '../../../shared/types';

interface HUDProps {
  player: Player | undefined;
  state: GameState;
  roomCode: string;
}

export default function HUD({ player, state, roomCode }: HUDProps) {
  const minutes = Math.floor(state.timeRemaining / 60);
  const seconds = Math.floor(state.timeRemaining % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isWarning = state.timeRemaining < 30;

  const energy = player?.energy ?? 0;
  const maxEnergy = 999;
  const energyPercent = Math.min((energy / maxEnergy) * 100, 100);

  return (
    <div className="hud-left">
      <div className="hud-card">
        <div className={`hud-timer ${isWarning ? 'warning' : ''}`}>
          {timeStr}
        </div>
      </div>

      {player && (
        <div className="hud-card hud-energy">
          <span className="hud-energy-label">Energy</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="hud-energy-bar">
              <div
                className="hud-energy-fill"
                style={{ width: `${energyPercent}%` }}
              />
            </div>
            <span className="hud-energy-value">{Math.floor(energy)}</span>
          </div>
          <div className="hud-stats">
            <div className="hud-stat">
              <span className="hud-stat-value">{player.nodeCount}</span>
              <span className="hud-stat-label">Nodes</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-value">{player.linkCount}</span>
              <span className="hud-stat-label">Links</span>
            </div>
          </div>
        </div>
      )}

      {roomCode && (
        <div className="hud-card hud-room-code">
          ROOM: {roomCode}
        </div>
      )}
    </div>
  );
}
