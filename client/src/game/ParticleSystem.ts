// ============================================================
// LINK.IO Client - Particle System
// Energy flow, collapse explosions, link sparkles, ambient
// ============================================================

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'flow' | 'collapse' | 'sparkle' | 'ambient' | 'deathRing' | 'respawn';
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private maxParticles = 800;

  update(deltaTime: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.min(1, (p.life / p.maxLife) * 2);
      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.type === 'collapse' || p.type === 'deathRing') {
        // Big glowing explosion particle
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'respawn') {
        // Sparkly upward-floating particles
        ctx.fillStyle = p.color;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = p.size * 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Energy flow along a link
  spawnFlowParticle(
    fromX: number, fromY: number,
    toX: number, toY: number,
    color: string
  ): void {
    if (this.particles.length >= this.maxParticles) return;
    const t = Math.random();
    this.particles.push({
      x: fromX + (toX - fromX) * t,
      y: fromY + (toY - fromY) * t,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      color,
      size: 1.5 + Math.random() * 1.5,
      type: 'flow',
    });
  }

  // Network collapse explosion
  spawnCollapseExplosion(x: number, y: number, color: string): void {
    const count = 25;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) return;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 60 + Math.random() * 120;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.8,
        maxLife: 1.4,
        color,
        size: 2 + Math.random() * 4,
        type: 'collapse',
      });
    }
  }

  // Link creation sparkle
  spawnLinkSparkle(x: number, y: number, color: string): void {
    for (let i = 0; i < 8; i++) {
      if (this.particles.length >= this.maxParticles) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3,
        maxLife: 0.6,
        color,
        size: 1 + Math.random() * 2,
        type: 'sparkle',
      });
    }
  }

  // Ambient floating particles
  spawnAmbient(x: number, y: number): void {
    if (this.particles.length >= this.maxParticles * 0.6) return;
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      life: 2 + Math.random() * 3,
      maxLife: 5,
      color: `hsl(${200 + Math.random() * 40}, 60%, ${40 + Math.random() * 20}%)`,
      size: 0.5 + Math.random() * 1.5,
      type: 'ambient',
    });
  }

  // MASSIVE death explosion when a player is eliminated
  spawnDeathExplosion(x: number, y: number, color: string): void {
    // Inner explosion ring - fast, bright
    const innerCount = 40;
    for (let i = 0; i < innerCount; i++) {
      if (this.particles.length >= this.maxParticles) return;
      const angle = (Math.PI * 2 * i) / innerCount + Math.random() * 0.2;
      const speed = 150 + Math.random() * 200;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 15,
        y: y + (Math.random() - 0.5) * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        color,
        size: 3 + Math.random() * 6,
        type: 'collapse',
      });
    }

    // Outer shockwave ring - slower, larger
    const outerCount = 30;
    for (let i = 0; i < outerCount; i++) {
      if (this.particles.length >= this.maxParticles) return;
      const angle = (Math.PI * 2 * i) / outerCount;
      const speed = 80 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.2 + Math.random() * 0.8,
        maxLife: 2.0,
        color: '#ffffff',
        size: 4 + Math.random() * 5,
        type: 'deathRing',
      });
    }

    // Debris particles - chaotic
    const debrisCount = 20;
    for (let i = 0; i < debrisCount; i++) {
      if (this.particles.length >= this.maxParticles) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 250;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 1.5,
        maxLife: 2.0,
        color,
        size: 1 + Math.random() * 3,
        type: 'sparkle',
      });
    }
  }

  // Respawn swirl effect
  spawnRespawnEffect(x: number, y: number, color: string): void {
    const count = 30;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) return;
      const angle = (Math.PI * 2 * i) / count;
      const radius = 40 + Math.random() * 30;
      this.particles.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        vx: -Math.cos(angle) * 50, // spiral inward
        vy: -Math.sin(angle) * 50 - 20, // float up
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        color,
        size: 2 + Math.random() * 3,
        type: 'respawn',
      });
    }
  }

  clear(): void {
    this.particles = [];
  }
}
