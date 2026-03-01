// ============================================================
// LINK.IO Server - Node Generator
// Procedural floating node spawning
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { GameNode, Vec2 } from '../../../shared/types.js';

export class NodeGenerator {
  private arenaWidth: number;
  private arenaHeight: number;
  private minDistance = 120;

  constructor(arenaWidth: number, arenaHeight: number) {
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
  }

  generateInitialNodes(count: number): GameNode[] {
    const nodes: GameNode[] = [];
    let attempts = 0;
    const maxAttempts = count * 20;

    while (nodes.length < count && attempts < maxAttempts) {
      attempts++;
      const margin = 200;
      const pos: Vec2 = {
        x: margin + Math.random() * (this.arenaWidth - margin * 2),
        y: margin + Math.random() * (this.arenaHeight - margin * 2),
      };

      // Check minimum distance from existing nodes
      const tooClose = nodes.some((n) => {
        const dx = n.position.x - pos.x;
        const dy = n.position.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) < this.minDistance;
      });

      if (!tooClose) {
        nodes.push(this.createNode(pos));
      }
    }

    return nodes;
  }

  createNode(position: Vec2, isCore = false, owner: string | null = null): GameNode {
    return {
      id: uuidv4(),
      position: { ...position },
      velocity: {
        x: (Math.random() - 0.5) * 0.3,
        y: (Math.random() - 0.5) * 0.3,
      },
      owner,
      energy: isCore ? 50 : 0,
      radius: isCore ? 18 : 10 + Math.random() * 6,
      isCore,
      driftPhase: Math.random() * Math.PI * 2,
      driftSpeed: 0.2 + Math.random() * 0.5,
      driftAmplitude: 8 + Math.random() * 15,
    };
  }

  getSpawnPosition(existingNodes: GameNode[]): Vec2 {
    let bestPos: Vec2 = { x: this.arenaWidth / 2, y: this.arenaHeight / 2 };
    let bestMinDist = 0;

    for (let i = 0; i < 50; i++) {
      const margin = 300;
      const pos: Vec2 = {
        x: margin + Math.random() * (this.arenaWidth - margin * 2),
        y: margin + Math.random() * (this.arenaHeight - margin * 2),
      };

      let minDist = Infinity;
      for (const node of existingNodes) {
        const dx = node.position.x - pos.x;
        const dy = node.position.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }

      if (minDist > bestMinDist && minDist > 200) {
        bestMinDist = minDist;
        bestPos = pos;
      }
    }

    return bestPos;
  }
}
