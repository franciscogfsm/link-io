// ============================================================
// LINK.IO Client - HUD Component  
// Energy, timer, abilities, combo, score
// ============================================================

import React, { useState } from 'react';
import type { Player, GameState, AbilityType, UpgradeType } from '../../../shared/types';
import { UPGRADE_COSTS, UPGRADE_LABELS, UPGRADE_DESCRIPTIONS, UPGRADE_MAX_TIER, UPGRADE_CATEGORIES, UPGRADE_ICONS } from '../../../shared/types';

const CATEGORY_COLORS: Record<string, string> = {
  DEFENSE: '#00c8ff',
  OFFENSE: '#ff4444',
  ECONOMY: '#39ff14',
  UTILITY: '#ffbe0b',
};

const CATEGORY_ICONS: Record<string, string> = {
  DEFENSE: '🛡️',
  OFFENSE: '⚔️',
  ECONOMY: '⚡',
  UTILITY: '🔧',
};

interface HUDProps {
  player: Player | undefined;
  state: GameState;
  roomCode: string;
  onUseAbility: (ability: AbilityType) => void;
  onUpgrade: (upgrade: UpgradeType) => void;
  isDead?: boolean;
  respawnTimer?: number;
  warpMode?: boolean;
  onToggleWarp?: () => void;
}

export default function HUD({ player, state, roomCode, onUseAbility, onUpgrade, isDead, respawnTimer, warpMode, onToggleWarp }: HUDProps) {
  const [showUpgrades, setShowUpgrades] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('DEFENSE');
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

  const abilities: { type: AbilityType; icon: React.ReactNode; label: string; desc: string; cost: number; key: string; color: string }[] = [
    {
      type: 'surge',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      ),
      label: 'PULSE',
      desc: 'Zap enemy links on your nodes',
      cost: 40,
      key: 'Q',
      color: '#00f0ff',
    },
    {
      type: 'shield',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      ),
      label: 'GUARD',
      desc: 'Full shield for 8s',
      cost: 30,
      key: 'R',
      color: '#39ff14',
    },
    {
      type: 'emp',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <circle cx="12" cy="12" r="4"></circle>
          <line x1="12" y1="3" x2="12" y2="7"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
          <line x1="3" y1="12" x2="7" y2="12"></line>
          <line x1="17" y1="12" x2="21" y2="12"></line>
        </svg>
      ),
      label: 'BLAST',
      desc: '500px explosion from core',
      cost: 60,
      key: 'E',
      color: '#ff006e',
    },
    {
      type: 'warp',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
          <path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
        </svg>
      ),
      label: 'WARP',
      desc: 'Teleport core to owned node',
      cost: 25,
      key: 'SPACE',
      color: '#bf5fff',
    },
  ];

  return (
    <>
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
        </>
      )}

      {roomCode && (
        <div className="hud-card hud-room-code">
          ROOM: {roomCode}
        </div>
      )}
    </div>

    {/* Bottom-left anchored: abilities + upgrades — never shifts */}
    {player && (
      <div className="hud-bottom-left">
          {/* Upgrade Shop — Tabbed Design (opens above toggle) */}
          {showUpgrades && (
            <div className="upgrade-shop">
              {/* Category Tabs */}
              <div className="upgrade-tabs">
                {Object.keys(UPGRADE_CATEGORIES).map((category) => (
                  <button
                    key={category}
                    className={`upgrade-tab ${activeTab === category ? 'active' : ''}`}
                    onClick={() => setActiveTab(category)}
                    style={{
                      '--tab-color': CATEGORY_COLORS[category],
                    } as React.CSSProperties}
                  >
                    <span className="upgrade-tab-icon">{CATEGORY_ICONS[category]}</span>
                    <span className="upgrade-tab-label">{category}</span>
                  </button>
                ))}
              </div>

              {/* Active Category Content */}
              <div className="upgrade-panel" style={{
                '--panel-color': CATEGORY_COLORS[activeTab],
              } as React.CSSProperties}>
                {UPGRADE_CATEGORIES[activeTab]?.map((type) => {
                  const tier = player.upgrades[type];
                  const maxed = tier >= UPGRADE_MAX_TIER;
                  const cost = maxed ? 0 : UPGRADE_COSTS[type][tier];
                  const canAfford = energy >= cost;
                  const canBuy = !maxed && canAfford;
                  const desc = maxed ? 'MAXED OUT' : UPGRADE_DESCRIPTIONS[type][tier];

                  return (
                    <button
                      key={type}
                      className={`upgrade-card ${canBuy ? 'available' : ''} ${maxed ? 'maxed' : ''}`}
                      onClick={() => canBuy && onUpgrade(type)}
                      disabled={!canBuy}
                      style={{
                        '--card-color': CATEGORY_COLORS[activeTab],
                      } as React.CSSProperties}
                    >
                      <div className="upgrade-card-left">
                        <span className="upgrade-card-icon">{UPGRADE_ICONS[type]}</span>
                      </div>
                      <div className="upgrade-card-center">
                        <div className="upgrade-card-name">{UPGRADE_LABELS[type]}</div>
                        <div className="upgrade-card-desc">{desc}</div>
                        <div className="upgrade-card-pips">
                          {Array.from({ length: UPGRADE_MAX_TIER }, (_, i) => (
                            <div
                              key={i}
                              className={`upgrade-card-pip ${i < tier ? 'filled' : ''}`}
                              style={{
                                '--pip-color': CATEGORY_COLORS[activeTab],
                              } as React.CSSProperties}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="upgrade-card-right">
                        {maxed ? (
                          <span className="upgrade-card-maxed">MAX</span>
                        ) : (
                          <span className={`upgrade-card-cost ${canAfford ? '' : 'expensive'}`}>
                            {cost}⚡
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
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

          {/* Ability buttons */}
          <div className="hud-abilities">
            {abilities.map((ab) => {
              const cd = player.abilityCooldowns[ab.type];
              const canUse = cd <= 0 && energy >= ab.cost;
              const maxCd = ab.type === 'surge' ? 12 : ab.type === 'shield' ? 15 : ab.type === 'emp' ? 20 : 10;
              const cdPercent = cd > 0 ? (cd / maxCd) * 100 : 0;
              const isWarpActive = ab.type === 'warp' && warpMode;

              return (
                <button
                  key={ab.type}
                  className={`ability-btn ${canUse ? 'ready' : 'cooldown'} ${isWarpActive ? 'warp-active' : ''}`}
                  onClick={() => {
                    if (ab.type === 'warp' && canUse) {
                      onToggleWarp?.();
                    } else if (canUse) {
                      onUseAbility(ab.type);
                    }
                  }}
                  disabled={!canUse && !isWarpActive}
                  title={`${ab.label}: ${ab.desc}`}
                  id={`ability-${ab.type}`}
                  style={{
                    '--ability-color': ab.color,
                  } as React.CSSProperties}
                >
                  <div className="ability-icon">{ab.icon}</div>
                  <div className="ability-label">{ab.label}</div>
                  <div className="ability-key">{ab.key}</div>
                  <div className="ability-desc">{ab.desc}</div>
                  {cd > 0 && (
                    <>
                      <div className="ability-cd-overlay" style={{ height: `${cdPercent}%` }} />
                      <div className="ability-cd-text">{Math.ceil(cd)}s</div>
                    </>
                  )}
                  {canUse && <div className="ability-cost">{ab.cost}⚡</div>}
                </button>
              );
            })}
          </div>

          {/* Warp mode indicator */}
          {warpMode && (
            <div className="warp-mode-hint">
              🌀 CLICK AN OWNED NODE TO WARP — Press SPACE again to cancel
            </div>
          )}

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
      </div>
    )}

    </>
  );
}
