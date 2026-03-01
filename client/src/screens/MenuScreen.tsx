// ============================================================
// LINK.IO Client - Menu Screen
// Premium landing page, clipboard copy, no emojis
// ============================================================

import { useState, useRef, useEffect } from 'react';

interface MenuScreenProps {
  onPlay: (name: string) => void;
  onCreateLobby: (name: string) => void;
  onJoinLobby: (name: string, code: string) => void;
  error: string | null;
  connecting: boolean;
  roomCode?: string;
}

export default function MenuScreen({ onPlay, onCreateLobby, onJoinLobby, error, connecting, roomCode }: MenuScreenProps) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

          <button
            className="btn btn-primary"
            onClick={() => onPlay(playerName)}
            disabled={connecting}
            id="play-button"
          >
            {connecting ? 'CONNECTING...' : 'PLAY'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => onCreateLobby(playerName)}
            disabled={connecting}
            id="create-lobby-button"
          >
            CREATE LOBBY
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

          {/* Room code display with clipboard copy */}
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
