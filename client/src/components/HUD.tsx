// ============================================================
// LINK.IO Client - HUD Component  
// Energy, timer, abilities, combo, score
// ============================================================

import React, { useState } from 'react';
import type { Player, GameState, AbilityType, UpgradeType } from '../../../shared/types';
import { UPGRADE_COSTS, UPGRADE_LABELS, UPGRADE_DESCRIPTIONS, UPGRADE_MAX_TIER, UPGRADE_CATEGORIES, UPGRADE_ICONS } from '../../../shared/types';

interface HUDProps {
  player: Player | undefined;
  state: GameState;
  roomCode: string;
  onUseAbility: (ability: AbilityType) => void;
  onUpgrade: (upgrade: UpgradeType) => void;
  isDead?: boolean;
  respawnTimer?: number;
}

export default function HUD({ player, state, roomCode, onUseAbility, onUpgrade, isDead, respawnTimer }: HUDProps) {
  const [showUpgrades, setShowUpgrades] = useState(false);
  const minutes = Math.floor(state.timeRemaining / 60);
  const seconds = Math.floor(state.timeRemaining % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isWarning = state.timeRemaining < 30;

  const energy = player?.energy ?? 0;
  const maxEnergy = 999;
  const energyPercent = Math.min((energy / maxEnergy) * 100, 100);

  const healthPercent = Math.min(
    ((player?.health ?? 100) / (player?.maxHealth ?? 100)) * 100,
    100
  );

  const abilities: { type: AbilityType; icon: React.ReactNode; label: string; cost: number; key: string }[] = [
    {
      type: 'surge',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      ),
      label: 'SURGE',
      cost: 40,
      key: 'Q'
    },
    {
      type: 'shield',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      ),
      label: 'SHIELD',
      cost: 30,
      key: 'R'
    },
    {
      type: 'emp',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      ),
      label: 'EMP',
      cost: 60,
      key: 'E'
    },
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
              <span className="hud-score">SCORE: {Math.floor(player.score)}</span>
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

            {/* Health bar */}
            <div className="hud-score-row" style={{ marginTop: 8 }}>
              <span className="hud-energy-label" style={{ color: '#ff006e' }}>Health</span>
              <span className="hud-energy-value" style={{ color: healthPercent > 60 ? '#39ff14' : healthPercent > 30 ? '#ffbe0b' : '#ff006e' }}>
                {Math.ceil(player.health ?? 0)} / {player.maxHealth ?? 100}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="hud-energy-bar" style={{ background: 'rgba(255, 0, 110, 0.15)' }}>
                <div
                  className="hud-energy-fill"
                  style={{
                    width: `${healthPercent}%`,
                    background: healthPercent > 60
                      ? 'linear-gradient(90deg, #39ff14, #00ff88)'
                      : healthPercent > 30
                      ? 'linear-gradient(90deg, #ffbe0b, #ff9500)'
                      : 'linear-gradient(90deg, #ff006e, #ff0044)',
                    boxShadow: healthPercent <= 30
                      ? '0 0 12px rgba(255, 0, 110, 0.6)'
                      : 'none',
                  }}
                />
              </div>
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
              <div className="hud-stat">
                <span className="hud-stat-value">{player.deaths}</span>
                <span className="hud-stat-label">Deaths</span>
              </div>
            </div>

            {/* Kill streak indicator */}
            {player.killStreak >= 3 && (
              <div className="hud-streak" style={{
                background: player.killStreak >= 10 ? 'rgba(255, 50, 50, 0.25)' :
                             player.killStreak >= 7 ? 'rgba(255, 150, 0, 0.25)' :
                             'rgba(255, 190, 11, 0.2)',
                border: `1px solid ${player.killStreak >= 10 ? '#ff3232' : player.killStreak >= 7 ? '#ff9600' : '#ffbe0b'}`,
                borderRadius: 6,
                padding: '4px 10px',
                marginTop: 6,
                textAlign: 'center',
                fontSize: 12,
                fontFamily: 'Orbitron, monospace',
                color: player.killStreak >= 10 ? '#ff4444' : '#ffbe0b',
                textShadow: `0 0 8px ${player.killStreak >= 10 ? '#ff4444' : '#ffbe0b'}`,
              }}>
                🔥 {player.killStreak} KILL STREAK
              </div>
            )}

            {/* Invulnerability indicator */}
            {player.invulnTimer > 0 && (
              <div style={{
                background: 'rgba(0, 240, 255, 0.15)',
                border: '1px solid rgba(0, 240, 255, 0.4)',
                borderRadius: 6,
                padding: '4px 10px',
                marginTop: 6,
                textAlign: 'center',
                fontSize: 11,
                fontFamily: 'Orbitron, monospace',
                color: '#00f0ff',
              }}>
                🛡️ INVULNERABLE {Math.ceil(player.invulnTimer)}s
              </div>
            )}
          </div>

          {/* Combo display */}
          {player.combo >= 2 && (
            <div className="hud-combo">
              <span className="hud-combo-text">COMBO x{player.combo}</span>
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

          {/* Click streak indicator */}
          {player.clickStreak >= 3 && (
            <div className="hud-click-streak" style={{
              background: player.clickStreak >= 20 ? 'rgba(255, 190, 11, 0.25)' :
                           player.clickStreak >= 10 ? 'rgba(57, 255, 20, 0.2)' :
                           'rgba(0, 240, 255, 0.15)',
              border: `1px solid ${player.clickStreak >= 20 ? '#ffbe0b' : player.clickStreak >= 10 ? '#39ff14' : '#00f0ff'}`,
              borderRadius: 6,
              padding: '4px 10px',
              marginTop: 4,
              textAlign: 'center',
              fontSize: 11,
              fontFamily: 'Orbitron, monospace',
              color: player.clickStreak >= 20 ? '#ffbe0b' : player.clickStreak >= 10 ? '#39ff14' : '#00f0ff',
              textShadow: `0 0 6px currentColor`,
            }}>
              ⚡ CLICK x{player.clickStreak} {player.clickStreak >= 20 ? '💥 MADNESS' : player.clickStreak >= 10 ? '🔥 FRENZY' : ''}
            </div>
          )}

          {/* Upgrade Shop Toggle */}
          <button
            className={`upgrade-toggle-btn ${showUpgrades ? 'active' : ''}`}
            onClick={() => setShowUpgrades(!showUpgrades)}
          >
            <span className="upgrade-toggle-icon">⬆</span>
            <span>UPGRADES</span>
            {showUpgrades ? <span className="upgrade-toggle-arrow">▼</span> : <span className="upgrade-toggle-arrow">▶</span>}
          </button>

          {/* Upgrade Shop — categorized */}
          {showUpgrades && (
            <div className="upgrade-shop">
              {Object.entries(UPGRADE_CATEGORIES).map(([category, types]) => (
                <div key={category} className="upgrade-category">
                  <div className="upgrade-category-label">{category}</div>
                  <div className="upgrade-category-items">
                    {types.map((type) => {
                      const tier = player.upgrades[type];
                      const maxed = tier >= UPGRADE_MAX_TIER;
                      const cost = maxed ? 0 : UPGRADE_COSTS[type][tier];
                      const canAfford = energy >= cost;
                      const canBuy = !maxed && canAfford;
                      const desc = maxed ? 'MAXED' : UPGRADE_DESCRIPTIONS[type][tier];

                      return (
                        <button
                          key={type}
                          className={`upgrade-btn ${canBuy ? 'available' : ''} ${maxed ? 'maxed' : ''}`}
                          onClick={() => canBuy && onUpgrade(type)}
                          disabled={!canBuy}
                          title={`${UPGRADE_LABELS[type]}: ${desc}`}
                        >
                          <div className="upgrade-header">
                            <span className="upgrade-icon-emoji">{UPGRADE_ICONS[type]}</span>
                            <span className="upgrade-name">{UPGRADE_LABELS[type]}</span>
                            <div className="upgrade-tiers">
                              {Array.from({ length: UPGRADE_MAX_TIER }, (_, i) => (
                                <span key={i} className={`upgrade-pip ${i < tier ? 'filled' : ''}`}>◆</span>
                              ))}
                            </div>
                          </div>
                          <div className="upgrade-footer">
                            <span className="upgrade-desc">{desc}</span>
                            {maxed ? (
                              <span className="upgrade-maxed-label">MAX</span>
                            ) : (
                              <span className={`upgrade-cost ${canAfford ? '' : 'too-expensive'}`}>
                                {cost}⚡
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
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
