// ============================================================
// LINK.IO Client - Game Renderer
// Canvas 2D: starfield, nodes, links, particles, effects
// ============================================================

import type { GameState, GameNode, GameLink, Player, Vec2 } from '../../../shared/types';

/** Set of player IDs currently invulnerable (managed by GameScreen). */
let invulnerablePlayerIds: Set<string> = new Set();
export function setInvulnerablePlayers(ids: Set<string>) { invulnerablePlayerIds = ids; }

/** Set of player IDs currently dead (managed by GameScreen). */
let deadPlayerIds: Set<string> = new Set();
export function setDeadPlayers(ids: Set<string>) { deadPlayerIds = ids; }
import { Camera } from './Camera';
import { ParticleSystem } from './ParticleSystem';
import { getPlayerColor, NEUTRAL_COLOR } from '../utils/colors';
import type { LinkDragState } from './InputHandler';

const MAX_LINK_DISTANCE = 350;

interface Star {
  x: number; y: number; size: number; brightness: number; twinkleSpeed: number;
}

interface FloatingText {
  text: string; x: number; y: number; color: string;
  life: number; maxLife: number; size: number;
}

interface EmoteDisplay {
  emote: string; position: Vec2; life: number;
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  particles: ParticleSystem;
  private stars: Star[] = [];
  private time = 0;
  private shakeX = 0;
  private shakeY = 0;
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;
  private floatingTexts: FloatingText[] = [];
  private emotes: EmoteDisplay[] = [];

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
    this.particles = new ParticleSystem();
    this.generateStars();
  }

  private generateStars(): void {
    for (let i = 0; i < 300; i++) {
      this.stars.push({
        x: Math.random() * 8000 - 2000,
        y: Math.random() * 6000 - 1500,
        size: 0.5 + Math.random() * 2,
        brightness: 0.2 + Math.random() * 0.8,
        twinkleSpeed: 0.5 + Math.random() * 2,
      });
    }
  }

  triggerScreenShake(intensity: number, duration: number): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = 0;
  }

  addFloatingText(text: string, x: number, y: number, color: string, size = 16): void {
    this.floatingTexts.push({
      text, x, y, color, life: 0, maxLife: 1.5, size,
    });
  }

  addEmote(emote: string, position: Vec2): void {
    this.emotes.push({ emote, position: { ...position }, life: 0 });
  }

  render(
    state: GameState, playerId: string,
    dragState: LinkDragState, hoveredNodeId: string | null,
    validTargets: string[], deltaTime: number
  ): void {
    this.time += deltaTime;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const ctx = this.ctx;

    // Screen shake
    if (this.shakeTimer < this.shakeDuration) {
      this.shakeTimer += deltaTime;
      const decay = 1 - (this.shakeTimer / this.shakeDuration);
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * decay * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * decay * 2;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    // Background
    ctx.fillStyle = '#060612';
    ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);
    this.drawStarfield(ctx);
    this.camera.applyTransform(ctx);
    this.drawBoundary(ctx, state.arenaWidth, state.arenaHeight);

    // Link range circle when dragging
    if (dragState.active && dragState.fromNodeId) {
      this.drawLinkRange(ctx, dragState, state.nodes, playerId, state.players);
    }

    // Draw links
    for (const link of state.links) {
      this.drawLink(ctx, link, state.nodes, state.players);
    }

    // Draw drag preview
    if (dragState.active && dragState.fromNodeId) {
      this.drawDragPreview(ctx, dragState, state.nodes, validTargets);
    }

    // Particles
    this.particles.update(deltaTime);
    if (Math.random() < 0.3) {
      this.particles.spawnAmbient(
        this.camera.x + (Math.random() - 0.5) * this.canvas.width / this.camera.zoom,
        this.camera.y + (Math.random() - 0.5) * this.canvas.height / this.camera.zoom
      );
    }
    for (const link of state.links) {
      if (Math.random() < 0.15) {
        const fromNode = state.nodes.find((n) => n.id === link.fromNodeId);
        const toNode = state.nodes.find((n) => n.id === link.toNodeId);
        if (fromNode && toNode) {
          const player = state.players.find((p) => p.id === link.owner);
          const color = player ? getPlayerColor(player.color).main : NEUTRAL_COLOR.main;
          this.particles.spawnFlowParticle(
            fromNode.position.x, fromNode.position.y,
            toNode.position.x, toNode.position.y, color
          );
        }
      }
    }
    this.particles.render(ctx);

    // Draw nodes
    for (const node of state.nodes) {
      const isValidTarget = validTargets.includes(node.id);
      this.drawNode(ctx, node, state.players, node.id === hoveredNodeId, playerId, dragState.active, isValidTarget);
    }

    // Floating texts
    this.updateFloatingTexts(ctx, deltaTime);

    // Emotes
    this.updateEmotes(ctx, deltaTime);

    // Minimap
    this.drawMinimap(ctx, state, playerId);

    ctx.restore();
  }

  private updateFloatingTexts(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      const progress = ft.life / ft.maxLife;
      const alpha = 1 - progress;
      const rise = progress * 50;

      ctx.save();
      ctx.font = `bold ${ft.size}px Orbitron, monospace`;
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, ft.y - rise);
      ctx.restore();
    }
  }

  private updateEmotes(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const em = this.emotes[i];
      em.life += dt;
      if (em.life >= 2) {
        this.emotes.splice(i, 1);
        continue;
      }
      const progress = em.life / 2;
      const alpha = 1 - progress;
      const rise = progress * 60;
      const scale = 1 + progress * 0.5;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${32 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(em.emote, em.position.x, em.position.y - 40 - rise);
      ctx.restore();
    }
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, playerId: string): void {
    // Draw in screen space
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(this.shakeX, this.shakeY);

    const mmW = 160;
    const mmH = (mmW * state.arenaHeight) / state.arenaWidth;
    const mmX = this.canvas.width - mmW - 16;
    const mmY = this.canvas.height - mmH - 16;
    const scaleX = mmW / state.arenaWidth;
    const scaleY = mmH / state.arenaHeight;

    // Background
    ctx.fillStyle = 'rgba(6, 6, 18, 0.8)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4, 6);
    ctx.fill();
    ctx.stroke();

    // Links
    ctx.globalAlpha = 0.4;
    for (const link of state.links) {
      const from = state.nodes.find((n) => n.id === link.fromNodeId);
      const to = state.nodes.find((n) => n.id === link.toNodeId);
      if (!from || !to) continue;
      const player = state.players.find((p) => p.id === link.owner);
      ctx.strokeStyle = player?.color || '#666';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mmX + from.position.x * scaleX, mmY + from.position.y * scaleY);
      ctx.lineTo(mmX + to.position.x * scaleX, mmY + to.position.y * scaleY);
      ctx.stroke();
    }

    // Nodes
    ctx.globalAlpha = 0.8;
    for (const node of state.nodes) {
      const nx = mmX + node.position.x * scaleX;
      const ny = mmY + node.position.y * scaleY;
      const player = node.owner ? state.players.find((p) => p.id === node.owner) : null;

      if (node.isPowerNode && !node.owner) {
        ctx.fillStyle = '#ffbe0b';
      } else if (node.isMegaNode && !node.owner) {
        ctx.fillStyle = '#ff00ff';
      } else {
        ctx.fillStyle = player?.color || '#334';
      }

      const r = node.isCore ? 3 : node.isPowerNode || node.isMegaNode ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Camera viewport
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const vpW = (this.canvas.width / this.camera.zoom) * scaleX;
    const vpH = (this.canvas.height / this.camera.zoom) * scaleY;
    const vpX = mmX + (this.camera.x - this.canvas.width / this.camera.zoom / 2) * scaleX;
    const vpY = mmY + (this.camera.y - this.canvas.height / this.camera.zoom / 2) * scaleY;
    ctx.strokeRect(vpX, vpY, vpW, vpH);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawStarfield(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(this.shakeX, this.shakeY);
    for (const star of this.stars) {
      const parallax = 0.15;
      const sx = star.x - this.camera.x * parallax;
      const sy = star.y - this.camera.y * parallax;
      const wx = ((sx % this.canvas.width) + this.canvas.width) % this.canvas.width;
      const wy = ((sy % this.canvas.height) + this.canvas.height) % this.canvas.height;
      const twinkle = 0.5 + 0.5 * Math.sin(this.time * star.twinkleSpeed);
      ctx.fillStyle = `rgba(180, 200, 255, ${star.brightness * twinkle})`;
      ctx.beginPath();
      ctx.arc(wx, wy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBoundary(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const margin = 80;
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 60, 120, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(0, 0, w, h);
    ctx.setLineDash([]);
    const corners = [[0, 0], [w, 0], [w, h], [0, h]];
    for (const [cx, cy] of corners) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, margin);
      grad.addColorStop(0, 'rgba(0, 100, 200, 0.15)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - margin, cy - margin, margin * 2, margin * 2);
    }
    ctx.restore();
  }

  private drawLinkRange(ctx: CanvasRenderingContext2D, dragState: LinkDragState, nodes: GameNode[], playerId: string, players: Player[]): void {
    const fromNode = nodes.find((n) => n.id === dragState.fromNodeId);
    if (!fromNode) return;
    const player = players.find((p) => p.id === playerId);
    const colors = player ? getPlayerColor(player.color) : NEUTRAL_COLOR;
    ctx.save();
    const pulse = 0.3 + 0.15 * Math.sin(this.time * 4);
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = pulse;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.arc(fromNode.position.x, fromNode.position.y, MAX_LINK_DISTANCE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawLink(ctx: CanvasRenderingContext2D, link: GameLink, nodes: GameNode[], players: Player[]): void {
    const fromNode = nodes.find((n) => n.id === link.fromNodeId);
    const toNode = nodes.find((n) => n.id === link.toNodeId);
    if (!fromNode || !toNode) return;

    const player = players.find((p) => p.id === link.owner);
    const colors = player ? getPlayerColor(player.color) : NEUTRAL_COLOR;
    const healthAlpha = link.health / link.maxHealth;
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 3 + link.energyFlow * 10);

    ctx.save();

    // Shield glow
    if (link.shielded) {
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.3)';
      ctx.lineWidth = 12;
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 5);
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(fromNode.position.x, fromNode.position.y);
      ctx.lineTo(toNode.position.x, toNode.position.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Glow layer
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = 6;
    ctx.globalAlpha = healthAlpha * pulse * 0.4;
    ctx.shadowColor = colors.main;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(fromNode.position.x, fromNode.position.y);
    ctx.lineTo(toNode.position.x, toNode.position.y);
    ctx.stroke();

    // Main line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = healthAlpha * 0.9;
    ctx.beginPath();
    ctx.moveTo(fromNode.position.x, fromNode.position.y);
    ctx.lineTo(toNode.position.x, toNode.position.y);
    ctx.stroke();

    // Energy dot
    const flowT = (this.time * 1.5 + link.energyFlow) % 1;
    const dotX = fromNode.position.x + (toNode.position.x - fromNode.position.x) * flowT;
    const dotY = fromNode.position.y + (toNode.position.y - fromNode.position.y) * flowT;
    ctx.fillStyle = colors.main;
    ctx.globalAlpha = healthAlpha;
    ctx.shadowColor = colors.main;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Health bar for damaged links
    if (link.health < link.maxHealth) {
      const midX = (fromNode.position.x + toNode.position.x) / 2;
      const midY = (fromNode.position.y + toNode.position.y) / 2;
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(midX - 15, midY - 10, 30, 4);
      ctx.fillStyle = healthAlpha > 0.5 ? '#39ff14' : healthAlpha > 0.25 ? '#ffbe0b' : '#ff006e';
      ctx.fillRect(midX - 15, midY - 10, 30 * healthAlpha, 4);
    }

    ctx.restore();
  }

  private drawNode(
    ctx: CanvasRenderingContext2D, node: GameNode, players: Player[],
    isHovered: boolean, playerId: string, isDragging: boolean, isValidTarget: boolean
  ): void {
    const { x, y } = node.position;
    const player = node.owner ? players.find((p) => p.id === node.owner) : null;
    const isOwned = node.owner === playerId;

    // Special colors for power/mega nodes
    let colors;
    if (!node.owner && node.isMegaNode) {
      colors = { main: '#ff00ff', glow: 'rgba(255, 0, 255, 0.5)', dark: 'rgba(100, 0, 100, 0.6)' };
    } else if (!node.owner && node.isPowerNode) {
      colors = { main: '#ffbe0b', glow: 'rgba(255, 190, 11, 0.5)', dark: 'rgba(100, 80, 0, 0.6)' };
    } else {
      colors = player ? getPlayerColor(player.color) : NEUTRAL_COLOR;
    }

    ctx.save();

    // Valid target highlight
    if (isValidTarget) {
      const targetPulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.4 + targetPulse * 0.4;
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Power node special outer ring
    if (node.isPowerNode && !node.owner) {
      const goldPulse = 0.4 + 0.6 * Math.sin(this.time * 3);
      ctx.strokeStyle = '#ffbe0b';
      ctx.lineWidth = 2;
      ctx.globalAlpha = goldPulse * 0.5;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // ★ label
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#ffbe0b';
      ctx.globalAlpha = goldPulse;
      ctx.textAlign = 'center';
      ctx.fillText('★ 3×', x, y - node.radius - 10);
      ctx.globalAlpha = 1;
    }

    // Mega node special effect
    if (node.isMegaNode && !node.owner) {
      const megaPulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      // Rotating hexagon
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = megaPulse * 0.6;
      const angle = this.time * 0.8;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = angle + (i / 6) * Math.PI * 2;
        const px = x + Math.cos(a) * (node.radius + 20);
        const py = y + Math.sin(a) * (node.radius + 20);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#ff00ff';
      ctx.globalAlpha = megaPulse;
      ctx.textAlign = 'center';
      ctx.fillText('MEGA', x, y - node.radius - 12);
      ctx.globalAlpha = 1;
    }

    // Outer glow
    const glowSize = node.radius * (node.isCore ? 3.5 : node.isPowerNode || node.isMegaNode ? 3 : 2.5);
    const pulse = node.isCore ? 0.6 + 0.4 * Math.sin(this.time * 2) : 0.5 + 0.2 * Math.sin(this.time * 1.5);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
    gradient.addColorStop(0, colors.glow.replace('0.5', String(pulse * 0.4)));
    gradient.addColorStop(0.5, colors.glow.replace('0.5', String(pulse * 0.15)));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Node body
    ctx.fillStyle = colors.dark;
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.shadowColor = colors.main;
    ctx.shadowBlur = isHovered ? 20 : 10;
    ctx.beginPath();
    ctx.arc(x, y, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Core node decoration
    if (node.isCore) {
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, node.radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();

      const angle = this.time * 0.5;
      const crossSize = node.radius * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * crossSize, y + Math.sin(angle) * crossSize);
      ctx.lineTo(x - Math.cos(angle) * crossSize, y - Math.sin(angle) * crossSize);
      ctx.moveTo(x + Math.cos(angle + Math.PI / 2) * crossSize, y + Math.sin(angle + Math.PI / 2) * crossSize);
      ctx.lineTo(x - Math.cos(angle + Math.PI / 2) * crossSize, y - Math.sin(angle + Math.PI / 2) * crossSize);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (isOwned && !isDragging) {
        ctx.shadowBlur = 0;
        ctx.font = '10px Orbitron, monospace';
        ctx.fillStyle = colors.main;
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 2);
        ctx.textAlign = 'center';
        ctx.fillText('⬆ DRAG FROM HERE', x, y + node.radius * 2 + 14);
        ctx.globalAlpha = 1;
      }
    }

    // Hover tooltips
    if (isHovered && isOwned && !isDragging) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.font = '9px Orbitron, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.textAlign = 'center';
      ctx.fillText('CLICK & DRAG', x, y - node.radius - 12);
      ctx.globalAlpha = 1;
    }

    if (isHovered && isValidTarget) {
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.font = '9px Orbitron, monospace';
      ctx.fillStyle = '#39ff14';
      ctx.globalAlpha = 0.9;
      ctx.textAlign = 'center';
      ctx.fillText('RELEASE TO LINK', x, y - node.radius - 12);
      ctx.globalAlpha = 1;
    }

    // Inner core dot
    ctx.fillStyle = colors.main;
    ctx.globalAlpha = 0.8;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, node.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Invulnerability shield - pulsing rainbow ring
    if (node.owner && invulnerablePlayerIds.has(node.owner)) {
      const shieldPulse = 0.5 + 0.5 * Math.sin(this.time * 8);
      const hue = (this.time * 120) % 360;
      ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.4 + shieldPulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
      ctx.shadowBlur = 15;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 10 + shieldPulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Inner white pulse
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + shieldPulse * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ghost effect for dead players' remaining nodes (fade them out)
    if (node.owner && deadPlayerIds.has(node.owner)) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawDragPreview(ctx: CanvasRenderingContext2D, dragState: LinkDragState, nodes: GameNode[], validTargets: string[]): void {
    const fromNode = nodes.find((n) => n.id === dragState.fromNodeId);
    if (!fromNode) return;
    const worldPos = this.camera.screenToWorld(dragState.mouseX, dragState.mouseY);

    let snapTarget: GameNode | undefined;
    for (const node of nodes) {
      if (validTargets.includes(node.id)) {
        const dx = node.position.x - worldPos.x;
        const dy = node.position.y - worldPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 50) { snapTarget = node; break; }
      }
    }

    const endX = snapTarget ? snapTarget.position.x : worldPos.x;
    const endY = snapTarget ? snapTarget.position.y : worldPos.y;

    ctx.save();
    ctx.strokeStyle = snapTarget ? 'rgba(57, 255, 20, 0.7)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = snapTarget ? 3 : 2;
    ctx.setLineDash([8, 8]);
    ctx.shadowColor = snapTarget ? '#39ff14' : '#ffffff';
    ctx.shadowBlur = snapTarget ? 15 : 8;
    ctx.beginPath();
    ctx.moveTo(fromNode.position.x, fromNode.position.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated dots
    const lineDist = Math.sqrt((endX - fromNode.position.x) ** 2 + (endY - fromNode.position.y) ** 2);
    const dotCount = Math.floor(lineDist / 30);
    for (let i = 0; i < dotCount; i++) {
      const t = ((i / dotCount) + this.time * 2) % 1;
      ctx.fillStyle = snapTarget ? '#39ff14' : '#ffffff';
      ctx.globalAlpha = 0.3 + 0.4 * (1 - t);
      ctx.beginPath();
      ctx.arc(
        fromNode.position.x + (endX - fromNode.position.x) * t,
        fromNode.position.y + (endY - fromNode.position.y) * t,
        2, 0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }
}
