// ============================================================
// LINK.IO Server - Anti-Cheat Validation
// ============================================================

import type { GameNode, GameLink, Player } from '../../../shared/types.js';

export class AntiCheat {
  private actionCooldowns = new Map<string, number>();
  private minActionInterval = 50; // ms — snappy linking
  private maxLinkDistance = 400; // slightly more than game allows for latency

  validateLinkCreation(
    playerId: string,
    fromNodeId: string,
    toNodeId: string,
    nodes: GameNode[],
    links: GameLink[],
    player: Player
  ): { valid: boolean; reason?: string } {
    // Rate limiting
    const now = Date.now();
    const lastAction = this.actionCooldowns.get(playerId) || 0;
    if (now - lastAction < this.minActionInterval) {
      return { valid: false, reason: 'Too fast! Wait a moment.' };
    }
    this.actionCooldowns.set(playerId, now);

    // Verify nodes exist
    const fromNode = nodes.find((n) => n.id === fromNodeId);
    const toNode = nodes.find((n) => n.id === toNodeId);
    if (!fromNode || !toNode) {
      return { valid: false, reason: 'Invalid nodes' };
    }

    // Distance check
    const dx = toNode.position.x - fromNode.position.x;
    const dy = toNode.position.y - fromNode.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.maxLinkDistance) {
      return { valid: false, reason: 'Nodes too far apart' };
    }

    // Ownership check
    if (fromNode.owner !== playerId) {
      return { valid: false, reason: 'You don\'t own the source node' };
    }

    // Energy check (basic)
    if (player.energy < 5) {
      return { valid: false, reason: 'Not enough energy' };
    }

    // Self-link check
    if (fromNodeId === toNodeId) {
      return { valid: false, reason: 'Cannot link a node to itself' };
    }

    // Max links per player (raised — decay system keeps networks in check)
    const playerLinkCount = links.filter((l) => l.owner === playerId).length;
    if (playerLinkCount > 80) {
      return { valid: false, reason: 'Too many links! Old links decay — wait or trim your network.' };
    }

    return { valid: true };
  }

  cleanup(playerId: string): void {
    this.actionCooldowns.delete(playerId);
  }
}
