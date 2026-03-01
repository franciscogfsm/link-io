// ============================================================
// LINK.IO Client - State Interpolation
// Smooth 60fps rendering from 20 TPS server updates
// ============================================================

import type { GameState, GameNode } from '../../../shared/types';

interface NodeSnapshot {
  x: number;
  y: number;
}

export class Interpolation {
  private prevState: Map<string, NodeSnapshot> = new Map();
  private targetState: Map<string, NodeSnapshot> = new Map();
  private lastUpdateTime = 0;
  private updateInterval = 33; // 30 TPS = ~33ms

  pushState(state: GameState): void {
    // Move target → prev
    this.prevState = new Map(this.targetState);
    this.targetState.clear();

    for (const node of state.nodes) {
      this.targetState.set(node.id, { x: node.position.x, y: node.position.y });
    }

    this.lastUpdateTime = performance.now();
  }

  interpolateNodes(nodes: GameNode[]): GameNode[] {
    const now = performance.now();
    const elapsed = now - this.lastUpdateTime;
    const t = Math.min(elapsed / this.updateInterval, 1);

    return nodes.map((node) => {
      const prev = this.prevState.get(node.id);
      const target = this.targetState.get(node.id);

      if (prev && target) {
        return {
          ...node,
          position: {
            x: prev.x + (target.x - prev.x) * t,
            y: prev.y + (target.y - prev.y) * t,
          },
        };
      }

      return node;
    });
  }
}
