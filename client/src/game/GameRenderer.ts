// ============================================================
// LINK.IO Client - Game Renderer
// Canvas 2D rendering: starfield, nodes, links, particles
// ============================================================

import type { GameState, GameNode, GameLink, Player } from '../../../shared/types';
import { Camera } from './Camera';
import { ParticleSystem } from './ParticleSystem';
import { getPlayerColor, NEUTRAL_COLOR } from '../utils/colors';
import type { LinkDragState } from './InputHandler';

const MAX_LINK_DISTANCE = 350;

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  particles: ParticleSystem;
  private stars: Star[] = [];
  private time = 0;

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

  render(
    state: GameState,
    playerId: string,
    dragState: LinkDragState,
    hoveredNodeId: string | null,
    validTargets: string[],
    deltaTime: number
  ): void {
    this.time += deltaTime;

    // Resize canvas
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    const ctx = this.ctx;

    // Clear with deep space background
    ctx.fillStyle = '#060612';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw starfield (screen space, parallax)
    this.drawStarfield(ctx);

    // Apply camera transform for game objects
    this.camera.applyTransform(ctx);

    // Draw arena boundary
    this.drawBoundary(ctx, state.arenaWidth, state.arenaHeight);

    // Draw link range circle when dragging
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

    // Update and draw particles
    this.particles.update(deltaTime);

    // Spawn ambient particles
    if (Math.random() < 0.3) {
      this.particles.spawnAmbient(
        this.camera.x + (Math.random() - 0.5) * this.canvas.width / this.camera.zoom,
        this.camera.y + (Math.random() - 0.5) * this.canvas.height / this.camera.zoom
      );
    }

    // Spawn flow particles along links
    for (const link of state.links) {
      if (Math.random() < 0.15) {
        const fromNode = state.nodes.find((n) => n.id === link.fromNodeId);
        const toNode = state.nodes.find((n) => n.id === link.toNodeId);
        if (fromNode && toNode) {
          const player = state.players.find((p) => p.id === link.owner);
          const color = player ? getPlayerColor(player.color).main : NEUTRAL_COLOR.main;
          this.particles.spawnFlowParticle(
            fromNode.position.x, fromNode.position.y,
            toNode.position.x, toNode.position.y,
            color
          );
        }
      }
    }

    this.particles.render(ctx);

    // Draw nodes on top
    for (const node of state.nodes) {
      const isValidTarget = validTargets.includes(node.id);
      this.drawNode(ctx, node, state.players, node.id === hoveredNodeId, playerId, dragState.active, isValidTarget);
    }
  }

  private drawStarfield(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    for (const star of this.stars) {
      const parallax = 0.15;
      const sx = star.x - this.camera.x * parallax;
      const sy = star.y - this.camera.y * parallax;

      // Wrap coordinates
      const wx = ((sx % this.canvas.width) + this.canvas.width) % this.canvas.width;
      const wy = ((sy % this.canvas.height) + this.canvas.height) % this.canvas.height;

      const twinkle = 0.5 + 0.5 * Math.sin(this.time * star.twinkleSpeed);
      const alpha = star.brightness * twinkle;

      ctx.fillStyle = `rgba(180, 200, 255, ${alpha})`;
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

    // Corner glow markers
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
    const fromNode = nodes.find(n => n.id === dragState.fromNodeId);
    if (!fromNode) return;

    const player = players.find(p => p.id === playerId);
    const colors = player ? getPlayerColor(player.color) : NEUTRAL_COLOR;

    ctx.save();

    // Draw range circle
    const pulse = 0.3 + 0.15 * Math.sin(this.time * 4);
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = pulse;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.arc(fromNode.position.x, fromNode.position.y, MAX_LINK_DISTANCE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Subtle fill
    const rangeFill = ctx.createRadialGradient(
      fromNode.position.x, fromNode.position.y, 0,
      fromNode.position.x, fromNode.position.y, MAX_LINK_DISTANCE
    );
    rangeFill.addColorStop(0, 'transparent');
    rangeFill.addColorStop(0.7, 'transparent');
    rangeFill.addColorStop(1, colors.glow.replace('0.5', '0.05'));
    ctx.fillStyle = rangeFill;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(fromNode.position.x, fromNode.position.y, MAX_LINK_DISTANCE, 0, Math.PI * 2);
    ctx.fill();

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

    // Animated energy dot flowing along the link
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

    // Health bar if damaged
    if (link.health < link.maxHealth) {
      const midX = (fromNode.position.x + toNode.position.x) / 2;
      const midY = (fromNode.position.y + toNode.position.y) / 2;
      const barWidth = 30;
      const barHeight = 4;
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(midX - barWidth / 2, midY - barHeight / 2 - 8, barWidth, barHeight);
      ctx.fillStyle = healthAlpha > 0.5 ? '#39ff14' : healthAlpha > 0.25 ? '#ffbe0b' : '#ff006e';
      ctx.fillRect(midX - barWidth / 2, midY - barHeight / 2 - 8, barWidth * healthAlpha, barHeight);
    }

    ctx.restore();
  }

  private drawNode(
    ctx: CanvasRenderingContext2D,
    node: GameNode,
    players: Player[],
    isHovered: boolean,
    playerId: string,
    isDragging: boolean,
    isValidTarget: boolean
  ): void {
    const { x, y } = node.position;
    const player = node.owner ? players.find((p) => p.id === node.owner) : null;
    const colors = player ? getPlayerColor(player.color) : NEUTRAL_COLOR;
    const isOwned = node.owner === playerId;

    ctx.save();

    // Valid target highlight (pulsing green ring when dragging)
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

    // Outer glow
    const glowSize = node.radius * (node.isCore ? 3.5 : 2.5);
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

    // Core node special decoration  
    if (node.isCore) {
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, node.radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating cross
      const angle = this.time * 0.5;
      const crossSize = node.radius * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * crossSize, y + Math.sin(angle) * crossSize);
      ctx.lineTo(x - Math.cos(angle) * crossSize, y - Math.sin(angle) * crossSize);
      ctx.moveTo(x + Math.cos(angle + Math.PI / 2) * crossSize, y + Math.sin(angle + Math.PI / 2) * crossSize);
      ctx.lineTo(x - Math.cos(angle + Math.PI / 2) * crossSize, y - Math.sin(angle + Math.PI / 2) * crossSize);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // "YOUR CORE" label for owned core when not dragging
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

    // Hover ring for owned nodes — show "clickable" feedback
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

      // Tooltip
      ctx.shadowBlur = 0;
      ctx.font = '9px Orbitron, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.textAlign = 'center';
      ctx.fillText('CLICK & DRAG', x, y - node.radius - 12);
      ctx.globalAlpha = 1;
    }

    // Hover ring for non-owned nodes during drag — "drop here" feedback
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

    // Inner bright core dot
    ctx.fillStyle = colors.main;
    ctx.globalAlpha = 0.8;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, node.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawDragPreview(ctx: CanvasRenderingContext2D, dragState: LinkDragState, nodes: GameNode[], validTargets: string[]): void {
    const fromNode = nodes.find((n) => n.id === dragState.fromNodeId);
    if (!fromNode) return;

    const worldPos = this.camera.screenToWorld(dragState.mouseX, dragState.mouseY);

    // Check if hovering over a valid target
    let snapTarget: GameNode | undefined;
    for (const node of nodes) {
      if (validTargets.includes(node.id)) {
        const dx = node.position.x - worldPos.x;
        const dy = node.position.y - worldPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 50) {
          snapTarget = node;
          break;
        }
      }
    }

    const endX = snapTarget ? snapTarget.position.x : worldPos.x;
    const endY = snapTarget ? snapTarget.position.y : worldPos.y;

    ctx.save();

    // Dashed preview line
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

    // Animated dots along the preview line
    const lineDist = Math.sqrt(
      (endX - fromNode.position.x) ** 2 + (endY - fromNode.position.y) ** 2
    );
    const dotCount = Math.floor(lineDist / 30);
    for (let i = 0; i < dotCount; i++) {
      const t = ((i / dotCount) + this.time * 2) % 1;
      const dx = fromNode.position.x + (endX - fromNode.position.x) * t;
      const dy = fromNode.position.y + (endY - fromNode.position.y) * t;
      ctx.fillStyle = snapTarget ? '#39ff14' : '#ffffff';
      ctx.globalAlpha = 0.3 + 0.4 * (1 - t);
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
