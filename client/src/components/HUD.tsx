// ============================================================
// LINK.IO Client - HUD Component  
// Energy, timer, abilities, combo, score
// ============================================================

import type { Player, GameState, AbilityType } from '../../../shared/types';

interface HUDProps {
  player: Player | undefined;
  state: GameState;
  roomCode: string;
  onUseAbility: (ability: AbilityType) => void;
}

export default function HUD({ player, state, roomCode, onUseAbility }: HUDProps) {
  const minutes = Math.floor(state.timeRemaining / 60);
  const seconds = Math.floor(state.timeRemaining % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isWarning = state.timeRemaining < 30;

  const energy = player?.energy ?? 0;
  const maxEnergy = 999;
  const energyPercent = Math.min((energy / maxEnergy) * 100, 100);

  const abilities: { type: AbilityType; icon: string; label: string; cost: number; key: string }[] = [
    { type: 'surge', icon: '⚡', label: 'SURGE', cost: 40, key: 'Q' },
    { type: 'shield', icon: '🛡️', label: 'SHIELD', cost: 30, key: 'W' },
    { type: 'emp', icon: '💣', label: 'EMP', cost: 60, key: 'E' },
  ];

  return (
    <div className="hud-left">
      <div className="hud-card">
        <div className={`hud-timer ${isWarning ? 'warning' : ''}`}>
          {timeStr}
        </div>
      </div>

      {player && (
        <>
          <div className="hud-card hud-energy">
            <div className="hud-score-row">
              <span className="hud-energy-label">Energy</span>
              <span className="hud-score">🏆 {Math.floor(player.score)}</span>
            </div>
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
              <div className="hud-stat">
                <span className="hud-stat-value">{player.killCount}</span>
                <span className="hud-stat-label">Kills</span>
              </div>
            </div>
          </div>

          {/* Combo display */}
          {player.combo >= 2 && (
            <div className="hud-combo">
              <span className="hud-combo-text">🔥 COMBO x{player.combo}</span>
            </div>
          )}

          {/* Ability buttons */}
          <div className="hud-abilities">
            {abilities.map((ab) => {
              const cd = player.abilityCooldowns[ab.type];
              const canUse = cd <= 0 && energy >= ab.cost;
              const cdPercent = cd > 0 ? (cd / (ab.type === 'surge' ? 12 : ab.type === 'shield' ? 15 : 20)) * 100 : 0;

              return (
                <button
                  key={ab.type}
                  className={`ability-btn ${canUse ? 'ready' : 'cooldown'}`}
                  onClick={() => canUse && onUseAbility(ab.type)}
                  disabled={!canUse}
                  title={`${ab.label} (${ab.key}) - ${ab.cost} energy`}
                  id={`ability-${ab.type}`}
                >
                  <div className="ability-icon">{ab.icon}</div>
                  <div className="ability-key">{ab.key}</div>
                  {cd > 0 && (
                    <>
                      <div className="ability-cd-overlay" style={{ height: `${cdPercent}%` }} />
                      <div className="ability-cd-text">{Math.ceil(cd)}s</div>
                    </>
                  )}
                  {canUse && <div className="ability-cost">{ab.cost}</div>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {roomCode && (
        <div className="hud-card hud-room-code">
          ROOM: {roomCode}
        </div>
      )}
    </div>
  );
}
