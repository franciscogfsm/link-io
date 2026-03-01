// ============================================================
// LINK.IO - Landing Page
// Modern, immersive marketing page that drives curiosity
// ============================================================

import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BoltIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  CubeTransparentIcon,
  SignalIcon,
  SparklesIcon,
  ChevronDownIcon,
  CommandLineIcon,
  CpuChipIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

// ─── Animated network background ───────────────────────────
function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    let mouseX = canvas.width / 2;
    let mouseY = canvas.height / 2;

    interface Node {
      x: number; y: number; vx: number; vy: number;
      radius: number; hue: number; pulse: number; pulseSpeed: number;
    }

    const nodes: Node[] = [];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const handleMouse = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouse);

    // Create nodes
    const count = Math.min(Math.floor(window.innerWidth / 12), 120);
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: 1.2 + Math.random() * 2.2,
        hue: 180 + Math.random() * 50,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.5 + Math.random() * 1.5,
      });
    }

    let time = 0;
    const draw = () => {
      time += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Gradient background
      const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, '#020208');
      bg.addColorStop(0.5, '#06061a');
      bg.addColorStop(1, '#020208');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle grid
      ctx.strokeStyle = 'rgba(0, 180, 220, 0.02)';
      ctx.lineWidth = 0.5;
      const gridSize = 80;
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

      // Connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const alpha = 0.06 * (1 - dist / 160);
            ctx.strokeStyle = `rgba(0, 220, 255, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Mouse influence glow
      const mouseGrad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 250);
      mouseGrad.addColorStop(0, 'rgba(0, 200, 255, 0.04)');
      mouseGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = mouseGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Nodes
      for (const n of nodes) {
        // Mouse repulsion (subtle)
        const mdx = n.x - mouseX;
        const mdy = n.y - mouseY;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mDist < 200 && mDist > 0) {
          const force = 0.15 * (1 - mDist / 200);
          n.vx += (mdx / mDist) * force;
          n.vy += (mdy / mDist) * force;
        }

        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.995;
        n.vy *= 0.995;

        if (n.x < 0) { n.x = 0; n.vx *= -1; }
        if (n.x > canvas.width) { n.x = canvas.width; n.vx *= -1; }
        if (n.y < 0) { n.y = 0; n.vy *= -1; }
        if (n.y > canvas.height) { n.y = canvas.height; n.vy *= -1; }

        n.pulse += n.pulseSpeed * 0.016;
        const pulseAlpha = 0.3 + 0.4 * Math.sin(n.pulse);
        const r = n.radius * (1 + 0.15 * Math.sin(n.pulse));

        ctx.fillStyle = `hsla(${n.hue}, 80%, 65%, ${pulseAlpha})`;
        ctx.shadowColor = `hsla(${n.hue}, 80%, 60%, 0.5)`;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Orbiting energy rings (decorative, top area)
      for (let ring = 0; ring < 3; ring++) {
        const cx = canvas.width * (0.3 + ring * 0.2);
        const cy = canvas.height * 0.15;
        const rx = 60 + ring * 30;
        const ry = 20 + ring * 10;
        const angle = time * (0.3 + ring * 0.15);
        ctx.strokeStyle = `rgba(0, 200, 255, ${0.03 + ring * 0.01})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
        ctx.stroke();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-bg-canvas" />;
}

// ─── Feature card ──────────────────────────────────────────
function FeatureCard({ icon, title, description }: {
  icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <div className="landing-feature-card">
      <div className="landing-feature-icon">{icon}</div>
      <h3 className="landing-feature-title">{title}</h3>
      <p className="landing-feature-desc">{description}</p>
    </div>
  );
}

// ─── Stat counter ──────────────────────────────────────────
function StatCounter({ value, label }: { value: string; label: string }) {
  return (
    <div className="landing-stat">
      <span className="landing-stat-value">{value}</span>
      <span className="landing-stat-label">{label}</span>
    </div>
  );
}

// ─── Main Landing Page ─────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    const root = document.getElementById('root');
    if (root) root.style.overflow = 'auto';

    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      if (root) root.style.overflow = '';
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div className="landing-root">
      <NetworkBackground />

      {/* ─── NAV ─── */}
      <nav className={`landing-nav ${scrollY > 60 ? 'scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <a href="/" className="landing-nav-logo">
            LINK<span className="landing-dot">.</span>IO
          </a>
          <div className="landing-nav-links">
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#how" className="landing-nav-link">How It Works</a>
            <button className="landing-nav-cta" onClick={() => navigate('/play')}>
              Play Now
              <ArrowRightIcon className="landing-nav-cta-icon" />
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <SignalIcon className="landing-badge-icon" />
            REAL-TIME MULTIPLAYER
          </div>
          <h1 className="landing-hero-title">
            Conquer the
            <br />
            <span className="landing-hero-accent">Network</span>
          </h1>
          <p className="landing-hero-sub">
            Build energy networks, sabotage rivals, and dominate the arena in the
            most intense real-time strategy .io game ever made. Every link matters.
            Every decision counts.
          </p>
          <div className="landing-hero-actions">
            <button
              className="landing-btn-primary"
              onClick={() => navigate('/play')}
            >
              <BoltIcon className="landing-btn-icon" />
              Play Now — Free
            </button>
            <a href="#features" className="landing-btn-ghost">
              Learn More
              <ChevronDownIcon className="landing-btn-icon-sm" />
            </a>
          </div>

          <div className="landing-hero-stats">
            <StatCounter value="30" label="Ticks / Second" />
            <StatCounter value="<50ms" label="Latency" />
            <StatCounter value="100%" label="Browser-Based" />
          </div>
        </div>

        {/* Floating decorative elements */}
        <div className="landing-hero-visual">
          <div className="landing-orb landing-orb-1" />
          <div className="landing-orb landing-orb-2" />
          <div className="landing-orb landing-orb-3" />
          <div className="landing-hex-ring" />
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="landing-section" id="features">
        <div className="landing-section-inner">
          <div className="landing-section-header">
            <span className="landing-section-tag">
              <CubeTransparentIcon className="landing-tag-icon" />
              FEATURES
            </span>
            <h2 className="landing-section-title">
              Engineered for <span className="landing-hero-accent">intensity</span>
            </h2>
            <p className="landing-section-sub">
              Every system is designed to create moments of brilliance, tension, and glory.
            </p>
          </div>

          <div className="landing-features-grid">
            <FeatureCard
              icon={<CubeTransparentIcon />}
              title="Anti-Gravity Arena"
              description="Nodes drift through space with sine-wave motion. The battlefield is alive and constantly shifting beneath your network."
            />
            <FeatureCard
              icon={<BoltIcon />}
              title="Energy Networks"
              description="Claim nodes, forge links, and watch energy flow through your network. Power nodes grant 3x energy. Mega nodes unlock abilities."
            />
            <FeatureCard
              icon={<ShieldCheckIcon />}
              title="Abilities & Shields"
              description="Deploy Surge for rapid expansion, Shield your critical links, or launch an EMP to devastate enemy networks."
            />
            <FeatureCard
              icon={<SparklesIcon />}
              title="Kill Streaks & Bounties"
              description="Chain eliminations for Killing Spree, Rampage, and Godlike streaks. High-streak players carry bounties worth massive points."
            />
            <FeatureCard
              icon={<SignalIcon />}
              title="30 TPS Server"
              description="Buttery-smooth 30 tick-per-second server with client-side interpolation. Every action registers instantly."
            />
            <FeatureCard
              icon={<GlobeAltIcon />}
              title="Instant Respawn"
              description="Die? You're back in 5 seconds with invulnerability. Never wait — always fight. Every round is a war of attrition."
            />
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="landing-section landing-section-dark" id="how">
        <div className="landing-section-inner">
          <div className="landing-section-header">
            <span className="landing-section-tag">
              <CommandLineIcon className="landing-tag-icon" />
              HOW IT WORKS
            </span>
            <h2 className="landing-section-title">
              Three steps to <span className="landing-hero-accent">domination</span>
            </h2>
          </div>

          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-number">01</div>
              <div className="landing-step-content">
                <h3 className="landing-step-title">Claim Your Core</h3>
                <p className="landing-step-desc">
                  You start with a single core node. It's your base, your lifeline. Lose it
                  and you're eliminated — but you'll be back in seconds.
                </p>
              </div>
            </div>
            <div className="landing-step-divider" />
            <div className="landing-step">
              <div className="landing-step-number">02</div>
              <div className="landing-step-content">
                <h3 className="landing-step-title">Expand Your Network</h3>
                <p className="landing-step-desc">
                  Drag links between nodes to claim territory. Energy flows through your
                  connections — the bigger your network, the more powerful you become.
                </p>
              </div>
            </div>
            <div className="landing-step-divider" />
            <div className="landing-step">
              <div className="landing-step-number">03</div>
              <div className="landing-step-content">
                <h3 className="landing-step-title">Destroy Everything</h3>
                <p className="landing-step-desc">
                  Collide your links with enemy networks to steal their nodes. Use abilities
                  strategically. Stack kill streaks. End the round on top.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TECH SECTION ─── */}
      <section className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-tech-row">
            <div className="landing-tech-info">
              <span className="landing-section-tag">
                <CpuChipIcon className="landing-tag-icon" />
                ARCHITECTURE
              </span>
              <h2 className="landing-section-title" style={{ textAlign: 'left' }}>
                Built for <span className="landing-hero-accent">performance</span>
              </h2>
              <p className="landing-tech-desc">
                Server-authoritative physics at 30 TPS. Client-side interpolation at 60 FPS.
                Socket.IO WebSocket transport with binary encoding. Anti-cheat validation on
                every action. Zero plugins, zero downloads — just open your browser and play.
              </p>
              <div className="landing-tech-stack">
                <span className="landing-tech-tag">TypeScript</span>
                <span className="landing-tech-tag">React 19</span>
                <span className="landing-tech-tag">Socket.IO</span>
                <span className="landing-tech-tag">Canvas 2D</span>
                <span className="landing-tech-tag">Node.js</span>
                <span className="landing-tech-tag">60 FPS</span>
              </div>
            </div>
            <div className="landing-tech-visual">
              <div className="landing-code-block">
                <div className="landing-code-header">
                  <span className="landing-code-dot" style={{ background: '#ff5f57' }} />
                  <span className="landing-code-dot" style={{ background: '#febc2e' }} />
                  <span className="landing-code-dot" style={{ background: '#28c840' }} />
                  <span className="landing-code-title">GameRoom.ts</span>
                </div>
                <pre className="landing-code-content">
{`// 30 TPS server loop
const TICK_RATE = 30;
const RESPAWN_TIME = 5;
const INVULN_TIME = 3;

tick() {
  // Physics, combat, energy
  this.updatePhysics(dt);
  this.handleCombat(players);
  this.flowEnergy(dt);
  
  // Broadcast state
  this.broadcastGameState();
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="landing-cta-section">
        <div className="landing-cta-inner">
          <h2 className="landing-cta-title">
            Ready to dominate?
          </h2>
          <p className="landing-cta-sub">
            No download. No signup. Just pure, real-time network warfare.
          </p>
          <button
            className="landing-btn-primary landing-btn-lg"
            onClick={() => navigate('/play')}
          >
            <BoltIcon className="landing-btn-icon" />
            Enter the Arena
          </button>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-footer-logo">
            LINK<span className="landing-dot">.</span>IO
          </span>
          <span className="landing-footer-text">
            Built with precision. Played with intensity.
          </span>
        </div>
      </footer>
    </div>
  );
}
