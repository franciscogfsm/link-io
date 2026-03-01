// ============================================================
// LINK.IO Server - Physics Engine
// Anti-gravity node drifting and soft boundaries
// ============================================================

import type { GameNode } from '../../../shared/types.js';

export class PhysicsEngine {
  private arenaWidth: number;
  private arenaHeight: number;
  private boundaryMargin = 100;
  private boundaryForce = 0.5;
  private separationDistance = 80;
  private separationForce = 0.15;
  private maxSpeed = 1.5;
  private damping = 0.98;

  constructor(arenaWidth: number, arenaHeight: number) {
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
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

    // Node separation forces
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.separationDistance && dist > 0) {
          const force = (this.separationDistance - dist) / this.separationDistance * this.separationForce;
          const nx = dx / dist;
          const ny = dy / dist;
          a.velocity.x -= nx * force;
          a.velocity.y -= ny * force;
          b.velocity.x += nx * force;
          b.velocity.y += ny * force;
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
