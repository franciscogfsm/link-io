// ============================================================
// LINK.IO Server - Physics Engine
// Anti-gravity node drifting and soft boundaries
// ============================================================

import type { GameNode } from '../../../shared/types.js';

export class PhysicsEngine {
  arenaWidth: number;
  arenaHeight: number;
  private boundaryMargin = 100;
  private boundaryForce = 0.5;
  private separationDistance = 80;
  private separationForce = 0.15;
  private maxSpeed = 1.5;
  private damping = 0.98;
  // Spatial grid for O(N) separation instead of O(N²)
  private gridCellSize = 100; // slightly bigger than separationDistance
  private grid = new Map<number, GameNode[]>();

  constructor(arenaWidth: number, arenaHeight: number) {
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
  }

  private getCellKey(x: number, y: number): number {
    const cx = (x / this.gridCellSize) | 0;
    const cy = (y / this.gridCellSize) | 0;
    return cx * 10000 + cy; // cheap hash, supports up to 10000 columns
  }

  update(nodes: GameNode[], deltaTime: number): void {
    for (const node of nodes) {
      // Anti-gravity drift using sine/cosine
      node.driftPhase += node.driftSpeed * deltaTime;
      const driftX = Math.cos(node.driftPhase) * node.driftAmplitude * 0.01;
      const driftY = Math.sin(node.driftPhase * 0.7) * node.driftAmplitude * 0.01;

      node.velocity.x += driftX * deltaTime;
      node.velocity.y += driftY * deltaTime;

      // Soft boundary repulsion
      if (node.position.x < this.boundaryMargin) {
        node.velocity.x += this.boundaryForce * (1 - node.position.x / this.boundaryMargin) * deltaTime;
      }
      if (node.position.x > this.arenaWidth - this.boundaryMargin) {
        node.velocity.x -= this.boundaryForce * (1 - (this.arenaWidth - node.position.x) / this.boundaryMargin) * deltaTime;
      }
      if (node.position.y < this.boundaryMargin) {
        node.velocity.y += this.boundaryForce * (1 - node.position.y / this.boundaryMargin) * deltaTime;
      }
      if (node.position.y > this.arenaHeight - this.boundaryMargin) {
        node.velocity.y -= this.boundaryForce * (1 - (this.arenaHeight - node.position.y) / this.boundaryMargin) * deltaTime;
      }

      // Hard boundaries
      node.position.x = Math.max(20, Math.min(this.arenaWidth - 20, node.position.x));
      node.position.y = Math.max(20, Math.min(this.arenaHeight - 20, node.position.y));
    }

    // Build spatial grid for separation (O(N) instead of O(N²))
    this.grid.clear();
    for (const node of nodes) {
      const key = this.getCellKey(node.position.x, node.position.y);
      let cell = this.grid.get(key);
      if (!cell) { cell = []; this.grid.set(key, cell); }
      cell.push(node);
    }

    // Node separation forces — only check neighboring cells
    const sepDist = this.separationDistance;
    const sepForce = this.separationForce;
    for (const node of nodes) {
      const cx = (node.position.x / this.gridCellSize) | 0;
      const cy = (node.position.y / this.gridCellSize) | 0;
      // Check 3x3 neighborhood
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = this.grid.get((cx + dx) * 10000 + (cy + dy));
          if (!cell) continue;
          for (const other of cell) {
            if (other === node) continue;
            const ddx = other.position.x - node.position.x;
            const ddy = other.position.y - node.position.y;
            const distSq = ddx * ddx + ddy * ddy;
            if (distSq < sepDist * sepDist && distSq > 0) {
              const dist = Math.sqrt(distSq);
              const force = (sepDist - dist) / sepDist * sepForce * 0.5; // halved since each pair processed twice
              const nx = ddx / dist;
              const ny = ddy / dist;
              node.velocity.x -= nx * force;
              node.velocity.y -= ny * force;
            }
          }
        }
      }
    }

    // Apply velocity and damping
    for (const node of nodes) {
      node.velocity.x *= this.damping;
      node.velocity.y *= this.damping;

      // Clamp speed
      const speed = Math.sqrt(node.velocity.x ** 2 + node.velocity.y ** 2);
      if (speed > this.maxSpeed) {
        node.velocity.x = (node.velocity.x / speed) * this.maxSpeed;
        node.velocity.y = (node.velocity.y / speed) * this.maxSpeed;
      }

      node.position.x += node.velocity.x;
      node.position.y += node.velocity.y;
    }
  }
}
