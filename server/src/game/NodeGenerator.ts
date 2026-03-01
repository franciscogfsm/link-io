// ============================================================
// LINK.IO Server - Node Generator
// Procedural floating node spawning with special nodes
// Spawn logic guarantees players start near reachable nodes
// ============================================================

import type { GameNode, Vec2 } from '../../../shared/types.js';

let _nextNodeId = 1;

export class NodeGenerator {
  arenaWidth: number;
  arenaHeight: number;
  private minDistance = 90;

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
      const margin = 150;
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
        // 12% chance of power node, 3% chance of mega node, 5% gold node
        const roll = Math.random();
        const isPowerNode = roll < 0.12;
        const isMegaNode = roll >= 0.12 && roll < 0.15;
        const isGoldNode = roll >= 0.15 && roll < 0.20;
        nodes.push(this.createNode(pos, false, null, isPowerNode, isMegaNode, isGoldNode));
      }
    }

    return nodes;
  }

  createNode(
    position: Vec2,
    isCore = false,
    owner: string | null = null,
    isPowerNode = false,
    isMegaNode = false,
    isGoldNode = false
  ): GameNode {
    return {
      id: `n${_nextNodeId++}`,
      position: { ...position },
      velocity: {
        x: (Math.random() - 0.5) * 0.3,
        y: (Math.random() - 0.5) * 0.3,
      },
      owner,
      energy: isCore ? 50 : 0,
      radius: isCore ? 18 : isMegaNode ? 16 : isPowerNode ? 14 : isGoldNode ? 12 : 10 + Math.random() * 6,
      isCore,
      isPowerNode,
      isMegaNode,
      isGoldNode,
      goldEnergy: isGoldNode ? 5 + Math.floor(Math.random() * 5) : 0,
      goldExpireTimer: isGoldNode ? 5 : 0,
      driftPhase: Math.random() * Math.PI * 2,
      driftSpeed: 0.2 + Math.random() * 0.5,
      driftAmplitude: 8 + Math.random() * 15,
    };
  }

  /** Spawn a single gold node at a random position */
  spawnGoldNode(existingNodes: GameNode[]): GameNode | null {
    for (let i = 0; i < 50; i++) {
      const margin = 200;
      const pos: Vec2 = {
        x: margin + Math.random() * (this.arenaWidth - margin * 2),
        y: margin + Math.random() * (this.arenaHeight - margin * 2),
      };
      const tooClose = existingNodes.some((n) => {
        const dx = n.position.x - pos.x;
        const dy = n.position.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) < this.minDistance;
      });
      if (!tooClose) {
        return this.createNode(pos, false, null, false, false, true);
      }
    }
    return null;
  }

  /** Generate additional neutral nodes to fill an expanded arena */
  generateExtraNodes(count: number, existingNodes: GameNode[]): GameNode[] {
    const nodes: GameNode[] = [];
    let attempts = 0;
    while (nodes.length < count && attempts < count * 20) {
      attempts++;
      const margin = 150;
      const pos: Vec2 = {
        x: margin + Math.random() * (this.arenaWidth - margin * 2),
        y: margin + Math.random() * (this.arenaHeight - margin * 2),
      };
      const allNodes = [...existingNodes, ...nodes];
      const tooClose = allNodes.some((n) => {
        const dx = n.position.x - pos.x;
        const dy = n.position.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) < this.minDistance;
      });
      if (!tooClose) {
        const roll = Math.random();
        const isPowerNode = roll < 0.12;
        const isMegaNode = roll >= 0.12 && roll < 0.15;
        const isGoldNode = roll >= 0.15 && roll < 0.20;
        nodes.push(this.createNode(pos, false, null, isPowerNode, isMegaNode, isGoldNode));
      }
    }
    return nodes;
  }

  /**
   * Find a spawn position that is:
   * - NEAR neutral (unowned) nodes so the player can immediately link
   * - FAR from other players' cores
   * - Has at least 3 neutral nodes within link range (350px)
   */
  getSpawnPosition(existingNodes: GameNode[]): Vec2 {
    const LINK_RANGE = 320; // slightly less than max link distance
    const playerCores = existingNodes.filter((n) => n.isCore && n.owner);
    const neutralNodes = existingNodes.filter((n) => !n.owner && !n.isCore);

    let bestPos: Vec2 = { x: this.arenaWidth / 2, y: this.arenaHeight / 2 };
    let bestScore = -Infinity;

    for (let i = 0; i < 200; i++) {
      const margin = 250;
      const pos: Vec2 = {
        x: margin + Math.random() * (this.arenaWidth - margin * 2),
        y: margin + Math.random() * (this.arenaHeight - margin * 2),
      };

      // Count neutral nodes within link range
      let nearbyNeutral = 0;
      let closestNeutralDist = Infinity;
      for (const node of neutralNodes) {
        const dx = node.position.x - pos.x;
        const dy = node.position.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_RANGE) nearbyNeutral++;
        if (dist < closestNeutralDist) closestNeutralDist = dist;
      }

      // Minimum distance to any player core (we want to be far from enemies)
      let minCoreDist = Infinity;
      for (const core of playerCores) {
        const dx = core.position.x - pos.x;
        const dy = core.position.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minCoreDist) minCoreDist = dist;
      }

      // Score: heavily reward nearby neutrals, reward distance from cores
      // Require at least 3 nearby neutrals for a valid spawn
      if (nearbyNeutral < 3) continue;

      const score =
        nearbyNeutral * 100 +         // lots of nearby nodes = good
        minCoreDist * 0.5 -            // far from enemies = good
        closestNeutralDist * 2;        // close to nearest node = good

      if (score > bestScore) {
        bestScore = score;
        bestPos = pos;
      }
    }

    // Fallback: if no good position found, pick center of densest neutral cluster
    if (bestScore === -Infinity && neutralNodes.length > 0) {
      let maxDensity = 0;
      for (const node of neutralNodes) {
        let density = 0;
        for (const other of neutralNodes) {
          const dx = other.position.x - node.position.x;
          const dy = other.position.y - node.position.y;
          if (Math.sqrt(dx * dx + dy * dy) < LINK_RANGE) density++;
        }
        if (density > maxDensity) {
          maxDensity = density;
          bestPos = { x: node.position.x, y: node.position.y };
        }
      }
    }

    return bestPos;
  }
}
