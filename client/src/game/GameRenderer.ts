// ============================================================
// LINK.IO Client - Game Renderer
// Canvas 2D: starfield, nodes, links, particles, effects
// ============================================================

import type { GameState, GameNode, GameLink, Player, Vec2, CosmeticType } from '../../../shared/types';

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

export interface PlayerCosmetics {
  skin: string;
  pet: string;
  trail: string;
  border: string;
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
  private lastCanvasW = 0;
  private lastCanvasH = 0;
  private playerCosmetics: Map<string, PlayerCosmetics> = new Map();
  private trailPositions: Map<string, Vec2[]> = new Map();

  setPlayerCosmetics(playerId: string, cosmetics: PlayerCosmetics): void {
    this.playerCosmetics.set(playerId, cosmetics);
  }

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

    // Only resize canvas when window dimensions actually change (avoids expensive context reset)
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    if (this.lastCanvasW !== ww || this.lastCanvasH !== wh) {
      this.canvas.width = ww;
      this.canvas.height = wh;
      this.lastCanvasW = ww;
      this.lastCanvasH = wh;
    }

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

    // Clear & Background
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#060612';
    ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);
    this.drawStarfield(ctx);
    this.camera.applyTransform(ctx);
    this.drawBoundary(ctx, state.arenaWidth, state.arenaHeight);

    // Map Events (draw beneath nodes and links)
    if (state.mapEvents && state.mapEvents.length > 0) {
      this.drawMapEvents(ctx, state.mapEvents);
    }

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

    // COSMETIC TRAILS — update trail positions for core nodes & render trails
    for (const node of state.nodes) {
      if (node.isCore && node.owner) {
        const cosmetics = this.playerCosmetics.get(node.owner);
        if (cosmetics && cosmetics.trail !== 'trail_none') {
          let trail = this.trailPositions.get(node.owner);
          if (!trail) {
            trail = [];
            this.trailPositions.set(node.owner, trail);
          }
          trail.unshift({ x: node.position.x, y: node.position.y });
          if (trail.length > 30) trail.pop();

          const player = state.players.find(p => p.id === node.owner);
          const colors = player ? getPlayerColor(player.color) : NEUTRAL_COLOR;
          this.drawTrail(ctx, trail, cosmetics.trail, colors.main);
        }
      }
    }

    // Build per-node link convergence count for visual indicators
    const nodeConvergence = new Map<string, number>();
    for (const link of state.links) {
      nodeConvergence.set(link.fromNodeId, (nodeConvergence.get(link.fromNodeId) || 0) + 1);
      nodeConvergence.set(link.toNodeId, (nodeConvergence.get(link.toNodeId) || 0) + 1);
    }

    // Draw nodes
    for (const node of state.nodes) {
      const isValidTarget = validTargets.includes(node.id);
      this.drawNode(ctx, node, state.players, node.id === hoveredNodeId, playerId, dragState.active, isValidTarget, nodeConvergence.get(node.id) || 0);
    }

    // Floating texts
    this.updateFloatingTexts(ctx, deltaTime);

    // Emotes
    this.updateEmotes(ctx, deltaTime);

    // Minimap
    this.drawMinimap(ctx, state, playerId);

    ctx.restore();
  }

  private drawMapEvents(ctx: CanvasRenderingContext2D, events: any[]): void {
    const time = Date.now() * 0.001;
    for (const evt of events) {
      ctx.save();
      ctx.translate(evt.position.x, evt.position.y);

      // Map event base colors
      let baseColor = '';
      if (evt.type === 'energy_storm') baseColor = '0, 255, 128'; // Greenish
      else if (evt.type === 'power_surge') baseColor = '255, 0, 80'; // Reddish
      else if (evt.type === 'overcharge') baseColor = '180, 0, 255'; // Purple
      else continue;

      const pulse = Math.sin(time * 3) * 0.1 + 0.9;
      const alpha = Math.min(1, evt.remaining / 2) * 0.2 * evt.intensity * pulse;

      // Inner glow fill
      const grad = ctx.createRadialGradient(0, 0, evt.radius * 0.1, 0, 0, evt.radius);
      grad.addColorStop(0, `rgba(${baseColor}, ${alpha})`);
      grad.addColorStop(1, `rgba(${baseColor}, 0)`);

      ctx.beginPath();
      ctx.arc(0, 0, evt.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Dashed animated border
      ctx.rotate(time * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0, evt.radius - 2), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${baseColor}, ${alpha * 2})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([15, 15]);
      ctx.stroke();

      ctx.restore();
    }
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

      if (node.isGoldNode && !node.owner) {
        ctx.fillStyle = '#ffd700';
      } else if (node.isPowerNode && !node.owner) {
        ctx.fillStyle = '#ffbe0b';
      } else if (node.isMegaNode && !node.owner) {
        ctx.fillStyle = '#ff00ff';
      } else {
        ctx.fillStyle = player?.color || '#334';
      }

      const r = node.isCore ? 3 : node.isPowerNode || node.isMegaNode || node.isGoldNode ? 2.5 : 1.5;
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

    // Low health flicker — decaying links blink as a warning
    const isLowHealth = healthAlpha < 0.35;
    const flicker = isLowHealth ? 0.4 + 0.6 * Math.abs(Math.sin(this.time * 8)) : 1;

    // Check link stretch distance for visual warning
    const ldx = toNode.position.x - fromNode.position.x;
    const ldy = toNode.position.y - fromNode.position.y;
    const linkDist = Math.sqrt(ldx * ldx + ldy * ldy);
    const STRETCH_WARN = 420;
    const STRETCH_BREAK = 500;
    const isStretched = linkDist > STRETCH_WARN;
    const stretchRatio = isStretched ? Math.min(1, (linkDist - STRETCH_WARN) / (STRETCH_BREAK - STRETCH_WARN)) : 0;

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
    ctx.strokeStyle = isStretched
      ? `rgba(255, ${Math.floor(50 * (1 - stretchRatio))}, ${Math.floor(50 * (1 - stretchRatio))}, ${0.9 * (0.4 + 0.6 * Math.sin(this.time * 12))})`
      : isLowHealth ? '#ff006e' : colors.main;
    ctx.lineWidth = isStretched ? 2.5 - stretchRatio * 1.5 : 1.0 + 1.5 * healthAlpha;
    ctx.globalAlpha = healthAlpha * 0.9 * flicker;
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
    isHovered: boolean, playerId: string, isDragging: boolean, isValidTarget: boolean,
    convergenceLinks: number = 0
  ): void {
    const { x, y } = node.position;
    const player = node.owner ? players.find((p) => p.id === node.owner) : null;
    const isOwned = node.owner === playerId;

    // Special colors for power/mega/gold nodes
    let colors;
    if (node.isGoldNode && !node.owner) {
      colors = { main: '#ffd700', glow: 'rgba(255, 215, 0, 0.5)', dark: 'rgba(120, 100, 0, 0.6)' };
    } else if (!node.owner && node.isMegaNode) {
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

    // Gold node sparkle effect (fades as timer expires)
    if (node.isGoldNode && node.goldEnergy > 0) {
      const expireFade = Math.min(1, (node.goldExpireTimer || 0) / 3); // fade out in last 3s
      const goldPulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      const urgency = expireFade < 0.5 ? 0.3 + 0.7 * Math.sin(this.time * 12) : 1; // flash when dying
      const sparkleCount = 6;
      for (let i = 0; i < sparkleCount; i++) {
        const angle = this.time * 1.2 + (i / sparkleCount) * Math.PI * 2;
        const dist = node.radius + 14 + Math.sin(this.time * 3 + i) * 4;
        const sx = x + Math.cos(angle) * dist;
        const sy = y + Math.sin(angle) * dist;
        ctx.fillStyle = '#ffd700';
        ctx.globalAlpha = goldPulse * 0.7 * expireFade * urgency;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Gold energy remaining label + timer
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = expireFade < 0.5 ? '#ff6b6b' : '#ffd700';
      ctx.globalAlpha = (0.6 + goldPulse * 0.4) * Math.max(0.3, expireFade);
      ctx.textAlign = 'center';
      const timerText = node.goldExpireTimer > 0 ? ` ${Math.ceil(node.goldExpireTimer)}s` : '';
      ctx.fillText(`⚡${Math.ceil(node.goldEnergy)}${timerText}`, x, y - node.radius - 10);
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
    const glowSize = node.radius * (node.isCore ? 3.5 : node.isPowerNode || node.isMegaNode || node.isGoldNode ? 3 : 2.5);
    const pulse = node.isCore ? 0.6 + 0.4 * Math.sin(this.time * 2) : 0.5 + 0.2 * Math.sin(this.time * 1.5);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
    gradient.addColorStop(0, colors.glow.replace('0.5', String(pulse * 0.4)));
    gradient.addColorStop(0.5, colors.glow.replace('0.5', String(pulse * 0.15)));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // CONVERGENCE VISUAL — nodes with 2+ links get power rings
    if (node.owner && convergenceLinks >= 2) {
      const cLevel = Math.min(convergenceLinks, 6); // cap visual at 6
      const cPulse = 0.5 + 0.5 * Math.sin(this.time * (2 + cLevel * 0.5));
      const ringRadius = node.radius + 6 + cLevel * 2;
      const ringAlpha = 0.15 + cLevel * 0.08;

      // Rotating convergence arcs — one per converging link
      for (let i = 0; i < cLevel; i++) {
        const arcAngle = (i / cLevel) * Math.PI * 2 + this.time * (1 + cLevel * 0.3);
        const arcLen = (Math.PI * 2) / (cLevel + 2);
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1.5 + cLevel * 0.3;
        ctx.globalAlpha = ringAlpha * cPulse;
        ctx.beginPath();
        ctx.arc(x, y, ringRadius, arcAngle, arcAngle + arcLen);
        ctx.stroke();
      }

      // Inner power glow intensifies with convergence
      const powerGlow = ctx.createRadialGradient(x, y, 0, x, y, node.radius + 4);
      powerGlow.addColorStop(0, colors.main.replace(')', `, ${0.1 * cLevel * cPulse})`).replace('rgb(', 'rgba('));
      powerGlow.addColorStop(1, 'transparent');
      ctx.globalAlpha = 1;
      ctx.fillStyle = powerGlow;
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 4, 0, Math.PI * 2);
      ctx.fill();

      // Convergence count label for 3+ links
      if (convergenceLinks >= 3) {
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = colors.main;
        ctx.globalAlpha = 0.7 + 0.3 * cPulse;
        ctx.textAlign = 'center';
        ctx.fillText(`×${convergenceLinks}`, x, y + node.radius + 14);
      }
      ctx.globalAlpha = 1;
    }

    // Node body — with skin support
    const cosmetics = node.owner ? this.playerCosmetics.get(node.owner) : null;
    const skinId = (node.isCore && cosmetics) ? cosmetics.skin : '';

    if (node.isCore && skinId === 'skin_hexagon') {
      // Hexagonal core
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = isHovered ? 20 : 10;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        const px = x + Math.cos(a) * node.radius;
        const py = y + Math.sin(a) * node.radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.fill();
      ctx.stroke();
    } else if (node.isCore && skinId === 'skin_diamond') {
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = isHovered ? 20 : 10;
      ctx.beginPath();
      ctx.moveTo(x, y - node.radius * 1.2);
      ctx.lineTo(x + node.radius, y);
      ctx.lineTo(x, y + node.radius * 1.2);
      ctx.lineTo(x - node.radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (node.isCore && skinId === 'skin_star') {
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = isHovered ? 20 : 10;
      const starPulse = 1 + 0.1 * Math.sin(this.time * 3);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + this.time * 0.3;
        const r = (i % 2 === 0 ? node.radius * starPulse : node.radius * 0.5);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (node.isCore && skinId === 'skin_plasma') {
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = isHovered ? 25 : 15;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Crackling bolts
      for (let i = 0; i < 4; i++) {
        const a = this.time * 2 + i * Math.PI / 2;
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 8 + i);
        ctx.beginPath();
        let bx = x, by = y;
        ctx.moveTo(bx, by);
        for (let j = 0; j < 4; j++) {
          bx += Math.cos(a + (Math.random() - 0.5) * 1.5) * (node.radius * 0.45);
          by += Math.sin(a + (Math.random() - 0.5) * 1.5) * (node.radius * 0.45);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (node.isCore && skinId === 'skin_galaxy') {
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = isHovered ? 20 : 10;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Spiral galaxy arms inside
      ctx.save();
      ctx.clip();
      for (let arm = 0; arm < 2; arm++) {
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        for (let t = 0; t < 30; t++) {
          const angle = this.time * 0.8 + arm * Math.PI + t * 0.2;
          const r = (t / 30) * node.radius * 0.9;
          const sx = x + Math.cos(angle) * r;
          const sy = y + Math.sin(angle) * r;
          if (t === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (node.isCore && skinId === 'skin_phoenix') {
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = '#ff6600';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Fire particles around
      for (let i = 0; i < 8; i++) {
        const a = this.time * 1.5 + i * Math.PI / 4;
        const dist = node.radius + 5 + Math.sin(this.time * 4 + i * 2) * 8;
        const fx = x + Math.cos(a) * dist;
        const fy = y + Math.sin(a) * dist - Math.sin(this.time * 3 + i) * 4;
        ctx.fillStyle = `hsl(${20 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 6 + i);
        ctx.beginPath();
        ctx.arc(fx, fy, 2 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (node.isCore && skinId === 'skin_glitch') {
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Glitch offset copies
      const glitchAmt = Math.sin(this.time * 12) > 0.8 ? 4 : 0;
      if (glitchAmt > 0) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#ff0044';
        ctx.beginPath();
        ctx.arc(x + glitchAmt, y - glitchAmt, node.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#00ffaa';
        ctx.beginPath();
        ctx.arc(x - glitchAmt, y + glitchAmt, node.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (node.isCore && skinId === 'skin_omega') {
      ctx.fillStyle = '#0a0a0a';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 35;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Omega symbol
      ctx.font = `bold ${node.radius}px Orbitron, monospace`;
      ctx.fillStyle = '#ffd700';
      ctx.globalAlpha = 0.9;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Ω', x, y + 2);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    } else if (node.isCore && skinId === 'skin_void') {
      // Dark core with swirling void
      ctx.fillStyle = '#050510';
      ctx.strokeStyle = '#8800ff';
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = '#8800ff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Swirl particles
      for (let i = 0; i < 6; i++) {
        const a = this.time * 1.5 + i * Math.PI / 3;
        const r = node.radius * 0.6 * (0.5 + 0.5 * Math.sin(this.time * 2 + i));
        ctx.fillStyle = '#aa44ff';
        ctx.globalAlpha = 0.3 + 0.3 * Math.sin(this.time * 3 + i);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (node.isCore && skinId === 'skin_pulse') {
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = isHovered ? 20 : 10;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Radiating pulse rings
      for (let i = 0; i < 3; i++) {
        const ringProgress = ((this.time * 0.5 + i * 0.33) % 1);
        const ringR = node.radius + ringProgress * node.radius * 2;
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = (1 - ringProgress) * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      // Default circle
      ctx.fillStyle = colors.dark;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = isHovered ? 20 : 10;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // COSMETIC BORDER around core nodes
    if (node.isCore && cosmetics && cosmetics.border !== 'border_none' && player) {
      const bdr = cosmetics.border;
      ctx.save();
      if (bdr === 'border_thin') {
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (bdr === 'border_double') {
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 14, 0, Math.PI * 2);
        ctx.stroke();
      } else if (bdr === 'border_dashed') {
        ctx.translate(x, y);
        ctx.rotate(this.time * 0.8);
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, node.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (bdr === 'border_gear') {
        ctx.translate(x, y);
        ctx.rotate(this.time * 0.5);
        const teeth = 12;
        const innerR = node.radius + 8;
        const outerR = node.radius + 14;
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const r = i % 2 === 0 ? outerR : innerR;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
      } else if (bdr === 'border_flame') {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + this.time * 1.5;
          const flicker = 2 + Math.sin(this.time * 5 + i * 3) * 4;
          const dist = node.radius + 8 + flicker;
          ctx.fillStyle = `hsl(${15 + Math.sin(this.time * 3 + i) * 15}, 100%, 55%)`;
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 4 + i);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (bdr === 'border_pulse') {
        const p = 0.5 + 0.5 * Math.sin(this.time * 3);
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 2 + p * 2;
        ctx.globalAlpha = 0.3 + p * 0.5;
        ctx.shadowColor = colors.main;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (bdr === 'border_holo') {
        const hue = (this.time * 60) % 360;
        ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (bdr === 'border_divine') {
        const gp = 0.5 + 0.5 * Math.sin(this.time * 2);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6 + gp * 0.3;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 12, 0, Math.PI * 2);
        ctx.stroke();
        // Inner golden ring
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // COSMETIC PET orbiting core nodes
    if (node.isCore && cosmetics && cosmetics.pet !== 'pet_none' && player) {
      const petId = cosmetics.pet;
      const orbitR = node.radius + 25;
      const petSpeed = 1.5;
      const petAngle = this.time * petSpeed;
      const px = x + Math.cos(petAngle) * orbitR;
      const py = y + Math.sin(petAngle) * orbitR;

      ctx.save();
      ctx.shadowBlur = 0;
      if (petId === 'pet_orb') {
        const p = 0.5 + 0.5 * Math.sin(this.time * 4);
        ctx.fillStyle = colors.main;
        ctx.globalAlpha = 0.6 + p * 0.4;
        ctx.shadowColor = colors.main;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (petId === 'pet_cube') {
        ctx.translate(px, py);
        ctx.rotate(this.time * 2);
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8;
        ctx.strokeRect(-4, -4, 8, 8);
      } else if (petId === 'pet_drone') {
        ctx.fillStyle = '#888';
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Propeller
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 1;
        const pa = this.time * 15;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(pa) * 7, py + Math.sin(pa) * 2);
        ctx.lineTo(px - Math.cos(pa) * 7, py - Math.sin(pa) * 2);
        ctx.stroke();
      } else if (petId === 'pet_skull') {
        ctx.font = '14px sans-serif';
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.time * 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', px, py);
      } else if (petId === 'pet_star') {
        const sp = 0.7 + 0.3 * Math.sin(this.time * 3);
        ctx.fillStyle = '#ffd700';
        ctx.globalAlpha = sp;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + this.time;
          const r = i % 2 === 0 ? 6 : 3;
          if (i === 0) ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
          else ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (petId === 'pet_dragon') {
        ctx.font = '16px sans-serif';
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐲', px, py);
      } else if (petId === 'pet_eye') {
        ctx.font = '14px sans-serif';
        ctx.globalAlpha = 0.8;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👁', px, py);
      } else if (petId === 'pet_blackhole') {
        const bhp = 0.5 + 0.5 * Math.sin(this.time * 3);
        ctx.fillStyle = '#220033';
        ctx.strokeStyle = '#8800ff';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.shadowColor = '#6600cc';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = bhp * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (petId === 'pet_crown') {
        ctx.font = '16px sans-serif';
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Float above
        const crownY = py - 4 + Math.sin(this.time * 2) * 3;
        ctx.fillText('👑', px, crownY);
      }
      ctx.restore();
    }

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

      // — HEALTH BAR above core nodes —
      if (player) {
        const hp = player.health ?? player.maxHealth ?? 100;
        const maxHp = player.maxHealth ?? 100;
        const hpPercent = Math.max(0, Math.min(1, hp / maxHp));

        if (hpPercent < 1 || node.owner === playerId) {
          const barW = 50;
          const barH = 5;
          const barX = x - barW / 2;
          const barY = y - node.radius - 22;

          // Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.beginPath();
          ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 3);
          ctx.fill();

          // Health fill
          const hpColor = hpPercent > 0.6 ? '#39ff14' : hpPercent > 0.3 ? '#ffbe0b' : '#ff006e';
          ctx.fillStyle = hpColor;
          ctx.shadowColor = hpColor;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.roundRect(barX, barY, barW * hpPercent, barH, 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // HP text
          ctx.font = '9px Orbitron, monospace';
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.8;
          ctx.textAlign = 'center';
          ctx.fillText(`${Math.ceil(hp)} HP`, x, barY - 4);
          ctx.globalAlpha = 1;
        }

        // Player name label under core
        ctx.font = '10px Orbitron, monospace';
        ctx.fillStyle = colors.main;
        ctx.globalAlpha = 0.7;
        ctx.textAlign = 'center';
        ctx.fillText(player.name, x, y + node.radius + 18);
        ctx.globalAlpha = 1;
      }

      if (isOwned && !isDragging) {
        ctx.shadowBlur = 0;
        ctx.font = '10px Orbitron, monospace';
        ctx.fillStyle = colors.main;
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 2);
        ctx.textAlign = 'center';
        ctx.fillText('⬆ DRAG FROM HERE', x, y + node.radius * 2 + 28);
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

    // Node Capture Progress ring
    if (node.captureProgress && node.captureProgress > 0 && node.capturedBy) {
      const capturer = players.find(p => p.id === node.capturedBy);
      if (capturer) {
        const captColor = getPlayerColor(capturer.color);
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (node.captureProgress * Math.PI * 2);

        // Background track
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Progress fill
        ctx.strokeStyle = captColor.main;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = captColor.glow;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 4, startAngle, endAngle);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.shadowBlur = 0;
      }
    }

    // Invulnerability shield - big glowing aura
    if (node.owner && invulnerablePlayerIds.has(node.owner)) {
      const shieldPulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      const fastPulse = 0.5 + 0.5 * Math.sin(this.time * 12);
      const hue = (this.time * 90) % 360;
      const shieldRadius = node.radius + 14 + shieldPulse * 6;

      // Outer glow fill - soft radial gradient aura
      const glowGrad = ctx.createRadialGradient(x, y, node.radius * 0.5, x, y, shieldRadius + 10);
      glowGrad.addColorStop(0, `hsla(${hue}, 100%, 80%, ${0.08 + fastPulse * 0.07})`);
      glowGrad.addColorStop(0.6, `hsla(${hue}, 100%, 65%, ${0.12 + shieldPulse * 0.1})`);
      glowGrad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(x, y, shieldRadius + 10, 0, Math.PI * 2);
      ctx.fill();

      // Main shield ring - thick, bright, with heavy glow
      ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${0.6 + shieldPulse * 0.35})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(x, y, shieldRadius, 0, Math.PI * 2);
      ctx.stroke();
      // Double-stroke for extra glow
      ctx.shadowBlur = 40;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Spinning dashed inner ring
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.time * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + fastPulse * 0.25})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, node.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Small orbiting sparkle dots
      for (let i = 0; i < 3; i++) {
        const angle = this.time * 3 + (i * Math.PI * 2) / 3;
        const orbitR = shieldRadius - 2;
        const sx = x + Math.cos(angle) * orbitR;
        const sy = y + Math.sin(angle) * orbitR;
        ctx.fillStyle = `hsla(${(hue + i * 60) % 360}, 100%, 90%, ${0.6 + fastPulse * 0.4})`;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
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

  private drawTrail(ctx: CanvasRenderingContext2D, trail: Vec2[], trailId: string, color: string): void {
    if (trail.length < 2) return;
    ctx.save();

    if (trailId === 'trail_spark') {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (1 - i / trail.length) * 0.6;
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(trail[i].x + (Math.random() - 0.5) * 4, trail[i].y + (Math.random() - 0.5) * 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (trailId === 'trail_smoke') {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (1 - i / trail.length) * 0.3;
        const size = 3 + (i / trail.length) * 8;
        ctx.fillStyle = '#888888';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (trailId === 'trail_fire') {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (1 - i / trail.length) * 0.7;
        const hue = 10 + (i / trail.length) * 30;
        ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(trail[i].x + (Math.random() - 0.5) * 3, trail[i].y + (Math.random() - 0.5) * 3, 2 + (i / trail.length) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (trailId === 'trail_rainbow') {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (1 - i / trail.length) * 0.6;
        const hue = (this.time * 100 + i * 15) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (trailId === 'trail_lightning') {
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < Math.min(trail.length, 15); i++) {
        const alpha = (1 - i / 15) * 0.8;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        const jx = (Math.random() - 0.5) * 8;
        const jy = (Math.random() - 0.5) * 8;
        ctx.lineTo(trail[i].x + jx, trail[i].y + jy);
        ctx.stroke();
      }
    } else if (trailId === 'trail_ice') {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (1 - i / trail.length) * 0.5;
        ctx.fillStyle = '#aaeeff';
        ctx.globalAlpha = alpha;
        ctx.shadowColor = '#66ccff';
        ctx.shadowBlur = 5;
        const size = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.arc(trail[i].x + (Math.random() - 0.5) * 5, trail[i].y + (Math.random() - 0.5) * 5, size, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (trailId === 'trail_void') {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (1 - i / trail.length) * 0.4;
        const size = 2 + (i / trail.length) * 6;
        ctx.fillStyle = '#220044';
        ctx.strokeStyle = '#6600cc';
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (trailId === 'trail_galaxy') {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (1 - i / trail.length) * 0.7;
        const hue = (this.time * 30 + i * 20) % 360;
        ctx.fillStyle = `hsl(${hue}, 80%, 80%)`;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = `hsl(${hue}, 80%, 60%)`;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(trail[i].x + (Math.random() - 0.5) * 6, trail[i].y + (Math.random() - 0.5) * 6, 1 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
      }
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
