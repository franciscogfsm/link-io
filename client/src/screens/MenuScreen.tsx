// ============================================================
// LINK.IO Client - Menu Screen
// Premium landing page, clipboard copy, player count, XP
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { socketManager } from '../network/SocketManager';
import type { GameMode, LobbyInfo, PlayerProgression, XP_PER_LEVEL, LEVEL_TITLES } from '../../../shared/types';

// Local XP functions
const XP_PER_LEVEL_VAL = 500;
const LEVEL_TITLES_ARR: [number, string][] = [
  [1, 'Newcomer'], [3, 'Node Runner'], [5, 'Link Master'],
  [8, 'Network Architect'], [12, 'Grid Commander'], [15, 'Cyber Warlord'],
  [20, 'Singularity'], [25, 'Digital God'], [30, 'TRANSCENDED'],
];

function getProgression(): PlayerProgression {
  try {
    const data = localStorage.getItem('linkio-progression');
    if (data) return JSON.parse(data);
  } catch { /* ignore */ }
  return {
    xp: 0, level: 1, gamesPlayed: 0, totalKills: 0,
    totalWins: 0, bestStreak: 0, longestGame: 0,
    titles: ['Newcomer'], currentTitle: 'Newcomer',
  };
}

function getLevelTitle(level: number): string {
  let title = 'Newcomer';
  for (const [threshold, t] of LEVEL_TITLES_ARR) {
    if (level >= threshold) title = t;
  }
  return title;
}

interface MenuScreenProps {
  onPlay: (name: string, gameMode: GameMode) => void;
  onCreateLobby: (name: string, gameMode: GameMode) => void;
  onJoinLobby: (name: string, code: string) => void;
  error: string | null;
  connecting: boolean;
  roomCode?: string;
  playerId?: string;
  lobbyInfo?: LobbyInfo | null;
  queueStatus?: { position: number; playersNeeded: number; message: string } | null;
  onLobbySetTeam?: (team: number) => void;
  onLobbyToggleReady?: () => void;
  onLobbyStartGame?: () => void;
}

export default function MenuScreen({ onPlay, onCreateLobby, onJoinLobby, error, connecting, roomCode, playerId, lobbyInfo, queueStatus, onLobbySetTeam, onLobbyToggleReady, onLobbyStartGame }: MenuScreenProps) {
  const [name, setName] = useState(() => localStorage.getItem('linkio-name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('ffa');
  const [copied, setCopied] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progression = getProgression();

  // Persist name
  useEffect(() => {
    if (name.trim()) localStorage.setItem('linkio-name', name.trim());
  }, [name]);

  // Get live player count
  useEffect(() => {
    const socket = socketManager.connect();
    socket.emit('player:requestPlayerCount');
    const unsub = socketManager.onPlayerCount((data) => {
      setOnlinePlayers(data.players);
    });
    return () => { unsub(); };
  }, []);

  // Animated background particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    interface BgParticle {
      x: number; y: number; vx: number; vy: number;
      size: number; alpha: number; hue: number;
    }

    const particles: BgParticle[] = [];
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: 1 + Math.random() * 2,
        alpha: 0.05 + Math.random() * 0.35,
        hue: 180 + Math.random() * 40,
      });
    }

    const draw = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.fillStyle = '#05050f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid lines (subtle)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[j].x - particles[i].x;
          const dy = particles[j].y - particles[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha})`;
        ctx.shadowColor = `hsla(${p.hue}, 80%, 60%, 0.4)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  const playerName = name.trim() || 'Player';

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = roomCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="menu-container">
      <canvas ref={canvasRef} className="menu-bg-canvas" />
      <div className="menu-content">
        <h1 className="menu-title">
          LINK<span className="dot">.</span>IO
        </h1>
        <p className="menu-subtitle">BUILD · CONNECT · DOMINATE</p>

        {/* Player count + XP bar */}
        <div className="menu-status-bar">
          {onlinePlayers > 0 && (
            <div className="menu-online-count">
              <span className="online-dot" />
              <span>{onlinePlayers} player{onlinePlayers !== 1 ? 's' : ''} online</span>
            </div>
          )}
          <div className="menu-xp-display">
            <span className="xp-level">LVL {progression.level}</span>
            <span className="xp-title">{progression.currentTitle}</span>
            <div className="xp-bar">
              <div className="xp-bar-fill" style={{ width: `${((progression.xp % XP_PER_LEVEL_VAL) / XP_PER_LEVEL_VAL) * 100}%` }} />
            </div>
            <span className="xp-text">{progression.xp % XP_PER_LEVEL_VAL}/{XP_PER_LEVEL_VAL} XP</span>
          </div>
        </div>

        {/* Queue status */}
        {queueStatus && (
          <div className="menu-queue-status">
            <div className="queue-spinner" />
            <span className="queue-message">{queueStatus.message}</span>
          </div>
        )}

        {/* Lobby view */}
        {lobbyInfo && (
          <div className="menu-lobby">
            <div className="lobby-header">
              <span className="lobby-title">{lobbyInfo.gameMode === 'teams' ? '2v2 TEAMS' : 'FFA'} LOBBY</span>
              <span
                className={`lobby-code clickable${copied ? ' copied' : ''}`}
                onClick={() => {
                  navigator.clipboard.writeText(lobbyInfo.code).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }).catch(() => {});
                }}
                title="Click to copy code"
              >
                {lobbyInfo.code}
                <span className="lobby-code-copy-icon">{copied ? ' ✓' : ' 📋'}</span>
              </span>
            </div>
            <div className="lobby-players">
              {lobbyInfo.gameMode === 'teams' ? (
                <div className="lobby-teams">
                  <div className="lobby-team lobby-team-1">
                    <span className="team-label">TEAM 1</span>
                    {lobbyInfo.players.filter(p => p.team === 1).map(p => (
                      <div key={p.id} className={`lobby-player ${p.ready ? 'ready' : ''}`}>
                        <span className="lobby-player-name">{p.name}</span>
                        {p.ready && <span className="lobby-ready-badge">READY</span>}
                      </div>
                    ))}
                    {lobbyInfo.players.filter(p => p.team === 1).length < 2 && (
                      <div className="lobby-player-empty">Waiting...</div>
                    )}
                  </div>
                  <div className="lobby-vs">VS</div>
                  <div className="lobby-team lobby-team-2">
                    <span className="team-label">TEAM 2</span>
                    {lobbyInfo.players.filter(p => p.team === 2).map(p => (
                      <div key={p.id} className={`lobby-player ${p.ready ? 'ready' : ''}`}>
                        <span className="lobby-player-name">{p.name}</span>
                        {p.ready && <span className="lobby-ready-badge">READY</span>}
                      </div>
                    ))}
                    {lobbyInfo.players.filter(p => p.team === 2).length < 2 && (
                      <div className="lobby-player-empty">Waiting...</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="lobby-ffa-list">
                  {lobbyInfo.players.map(p => (
                    <div key={p.id} className={`lobby-player ${p.ready ? 'ready' : ''}`}>
                      <span className="lobby-player-name">{p.name}</span>
                      {p.ready && <span className="lobby-ready-badge">READY</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lobby-actions">
              {lobbyInfo.gameMode === 'teams' && onLobbySetTeam && (
                <div className="lobby-team-buttons">
                  <button className="btn btn-sm" onClick={() => onLobbySetTeam(1)}>Join Team 1</button>
                  <button className="btn btn-sm" onClick={() => onLobbySetTeam(2)}>Join Team 2</button>
                </div>
              )}
              {onLobbyToggleReady && (
                <button className="btn btn-accent" onClick={onLobbyToggleReady}>
                  TOGGLE READY
                </button>
              )}
              {onLobbyStartGame && playerId === lobbyInfo.hostId && (
                <button className="btn btn-primary" onClick={onLobbyStartGame}>
                  START GAME
                </button>
              )}
              {lobbyInfo.hostId !== playerId && (
                <div className="lobby-host-hint">Waiting for <strong>{lobbyInfo.hostName}</strong> to start…</div>
              )}
            </div>
          </div>
        )}

        {/* Normal menu (only show when not in a lobby) */}
        {!lobbyInfo && !queueStatus && (
          <div className="menu-buttons">
            <input
              className="menu-input menu-name-input"
              type="text"
              placeholder="Enter your name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              id="player-name-input"
            />

            <div className="mode-toggle">
              <button
                className={`mode-btn ${gameMode === 'ffa' ? 'active' : ''}`}
                onClick={() => setGameMode('ffa')}
              >
                FREE-FOR-ALL
              </button>
              <button
                className={`mode-btn ${gameMode === 'teams' ? 'active' : ''}`}
                onClick={() => setGameMode('teams')}
              >
                2v2 TEAMS
              </button>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => onPlay(playerName, gameMode)}
              disabled={connecting}
              id="play-button"
            >
              {connecting ? 'CONNECTING...' : gameMode === 'teams' ? 'FIND 2v2 MATCH' : 'PLAY NOW'}
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => onCreateLobby(playerName, gameMode)}
              disabled={connecting}
              id="create-lobby-button"
            >
              {gameMode === 'teams' ? 'CREATE 2v2 LOBBY' : 'CREATE LOBBY'}
            </button>

            <div className="menu-divider">
              <span className="menu-divider-line" />
              <span className="menu-divider-text">OR JOIN</span>
              <span className="menu-divider-line" />
            </div>

            <div className="join-row">
              <input
                className="menu-input"
                type="text"
                placeholder="Room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={5}
                id="join-code-input"
              />
              <button
                className="btn btn-accent"
                onClick={() => onJoinLobby(playerName, joinCode)}
                disabled={connecting || joinCode.length < 3}
                id="join-button"
              >
                JOIN
              </button>
            </div>

            {/* Room code display */}
            {roomCode && (
            <div className="room-code-display">
              <span className="room-code-label">ROOM CODE</span>
              <div className="room-code-value" onClick={handleCopyCode} title="Click to copy">
                <span className="room-code-text">{roomCode}</span>
                <span className="room-code-copy">
                  {copied ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#39ff14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  )}
                </span>
              </div>
              {copied && <span className="room-code-copied">Copied!</span>}
            </div>
          )}

          {error && <div className="menu-error">{error}</div>}
          </div>
        )}

        {error && !lobbyInfo && !queueStatus && <div className="menu-error">{error}</div>}

        <div className="menu-footer">
          <span className="menu-footer-text">SPACE = snap camera</span>
          <span className="menu-footer-sep">|</span>
          <span className="menu-footer-text">Q/W/E = abilities</span>
          <span className="menu-footer-sep">|</span>
          <span className="menu-footer-text">RIGHT-CLICK = pan</span>
        </div>
      </div>
    </div>
  );
}
