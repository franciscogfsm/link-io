// ============================================================
// LINK.IO Client - Menu Screen
// Animated title, play/lobby buttons, join by code
// ============================================================

import { useState, useRef, useEffect } from 'react';

interface MenuScreenProps {
  onPlay: (name: string) => void;
  onCreateLobby: (name: string) => void;
  onJoinLobby: (name: string, code: string) => void;
  error: string | null;
  connecting: boolean;
}

export default function MenuScreen({ onPlay, onCreateLobby, onJoinLobby, error, connecting }: MenuScreenProps) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
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
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: 1 + Math.random() * 2.5,
        alpha: 0.1 + Math.random() * 0.4,
        hue: 180 + Math.random() * 40,
      });
    }

    const draw = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.fillStyle = '#060612';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[j].x - particles[i].x;
          const dy = particles[j].y - particles[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.strokeStyle = `rgba(0, 200, 255, ${0.06 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
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
        ctx.shadowColor = `hsla(${p.hue}, 80%, 60%, 0.5)`;
        ctx.shadowBlur = 8;
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

  return (
    <div className="menu-container">
      <canvas ref={canvasRef} className="menu-bg-canvas" />
      <div className="menu-content">
        <h1 className="menu-title">
          LINK<span className="dot">.</span>IO
        </h1>
        <p className="menu-subtitle">Build · Connect · Dominate</p>

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
            {connecting ? '⏳ Connecting...' : '⚡ Play'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => onCreateLobby(playerName)}
            disabled={connecting}
            id="create-lobby-button"
          >
            🏠 Create Lobby
          </button>

          <div className="menu-divider">or</div>

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
              Join
            </button>
          </div>

          {error && <div className="menu-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
