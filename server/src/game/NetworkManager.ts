// ============================================================
// LINK.IO Server - Network Manager
// Handles energy networks, links, flow, and combat
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { GameNode, GameLink, Player } from '../../../shared/types.js';

export class NetworkManager {
  private linkCostBase = 8;
  private linkCostPerDistance = 0.015;
  private maxLinkDistance = 350;
  private baseEnergyPerNode = 2; // per second
  private combatDamagePerSecond = 20; // more aggressive combat!
  private networkBonusMultiplier = 0.15; // bonus per connected node

  createLink(
    fromNodeId: string,
    toNodeId: string,
    playerId: string,
    nodes: GameNode[],
    links: GameLink[],
    player: Player
  ): GameLink | null {
    const fromNode = nodes.find((n) => n.id === fromNodeId);
    const toNode = nodes.find((n) => n.id === toNodeId);
    if (!fromNode || !toNode) return null;

    // Check distance
    const dx = toNode.position.x - fromNode.position.x;
    const dy = toNode.position.y - fromNode.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.maxLinkDistance) return null;

    // Must own source node or it's the core
    if (fromNode.owner !== playerId) return null;

    // Check duplicate link
    const existingLink = links.find(
      (l) =>
        (l.fromNodeId === fromNodeId && l.toNodeId === toNodeId) ||
        (l.fromNodeId === toNodeId && l.toNodeId === fromNodeId)
    );
    if (existingLink) return null;

    // Calculate cost
    const cost = this.linkCostBase + distance * this.linkCostPerDistance;
    if (player.energy < cost) return null;

    // Deduct energy
    player.energy -= cost;

    // Check if target node belongs to enemy (combat)
    const isEnemyNode = toNode.owner !== null && toNode.owner !== playerId;

    // Claim the target node if neutral
    if (toNode.owner === null) {
      toNode.owner = playerId;
    }

    const link: GameLink = {
      id: uuidv4(),
      fromNodeId,
      toNodeId,
      owner: playerId,
      health: 100,
      maxHealth: 100,
      energyFlow: 0,
      shielded: false,
    };

    // If connecting to enemy node, create an attacking link
    if (isEnemyNode) {
      link.health = 50; // attacking links are weaker
    }

    return link;
  }

  updateEnergy(
    nodes: GameNode[],
    links: GameLink[],
    players: Player[],
    deltaTime: number
  ): void {
    for (const player of players) {
      if (!player.alive) continue;

      // Count player's connected nodes
      const ownedNodes = nodes.filter((n) => n.owner === player.id);
      const nodeCount = ownedNodes.length;
      const linkCount = links.filter((l) => l.owner === player.id).length;

      // Network bonus: larger networks generate exponentially more energy!
      // This rewards aggressive expansion
      const networkMultiplier = 1 + (nodeCount - 1) * this.networkBonusMultiplier;
      
      // Territory control bonus: owning many nodes gives extra per-tick energy  
      const territoryBonus = nodeCount >= 10 ? 3 : nodeCount >= 5 ? 1.5 : 0;

      for (const node of ownedNodes) {
        if (!node.isCore) {
          // Power nodes give 3x, Mega nodes give 5x energy!
          const nodeMultiplier = node.isMegaNode ? 5 : node.isPowerNode ? 3 : 1;
          const generation = (this.baseEnergyPerNode * networkMultiplier * nodeMultiplier + territoryBonus) * deltaTime;
          player.energy += generation;
          node.energy = Math.min(node.energy + generation * 0.5, 100);
        }
      }

      // Core always generates a base amount
      const coreNode = ownedNodes.find((n) => n.isCore);
      if (coreNode) {
        player.energy += 1 * deltaTime;
      }

      // Update player stats
      player.nodeCount = nodeCount;
      player.linkCount = linkCount;
      player.energy = Math.min(player.energy, 999);
    }

    // Energy flows through links (visual)
    for (const link of links) {
      link.energyFlow = Math.sin(Date.now() * 0.003) * 0.5 + 0.5;
    }
  }

  handleCombat(
    links: GameLink[],
    nodes: GameNode[],
    deltaTime: number
  ): { destroyedLinks: string[]; collapsedNodes: Map<string, string[]> } {
    const destroyedLinks: string[] = [];
    const collapsedNodes = new Map<string, string[]>();

    // Find conflicting links (different owners connecting same nodes)
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const toNode = nodes.find((n) => n.id === link.toNodeId);
      if (!toNode) continue;

      // If the target node is owned by someone else, damage the link
      // But NOT if the link is shielded!
      if (toNode.owner && toNode.owner !== link.owner && !link.shielded) {
        link.health -= this.combatDamagePerSecond * deltaTime;
      }

      // Check for counter-links (enemy links touching your nodes)
      for (let j = 0; j < links.length; j++) {
        if (i === j) continue;
        const otherLink = links[j];
        if (otherLink.owner === link.owner) continue;

        // If links share a node, both take damage (war of attrition!)
        // Shielded links are immune
        if (
          !link.shielded &&
          (link.fromNodeId === otherLink.toNodeId ||
          link.toNodeId === otherLink.fromNodeId ||
          link.fromNodeId === otherLink.fromNodeId ||
          link.toNodeId === otherLink.toNodeId)
        ) {
          link.health -= this.combatDamagePerSecond * 0.7 * deltaTime;
        }
      }

      if (link.health <= 0) {
        destroyedLinks.push(link.id);
      }
    }

    // Remove destroyed links and cascade disconnections
    for (const linkId of destroyedLinks) {
      const linkIdx = links.findIndex((l) => l.id === linkId);
      if (linkIdx !== -1) {
        const link = links[linkIdx];
        links.splice(linkIdx, 1);

        // Check for disconnected nodes
        const disconnected = this.findDisconnectedNodes(
          link.owner,
          nodes,
          links
        );
        if (disconnected.length > 0) {
          collapsedNodes.set(link.owner, disconnected);
          // Make disconnected nodes neutral
          for (const nodeId of disconnected) {
            const node = nodes.find((n) => n.id === nodeId);
            if (node && !node.isCore) {
              node.owner = null;
              node.energy = 0;
            }
          }
          // Remove links owned by this player that connect to disconnected nodes
          for (let i = links.length - 1; i >= 0; i--) {
            if (
              links[i].owner === link.owner &&
              (disconnected.includes(links[i].fromNodeId) ||
                disconnected.includes(links[i].toNodeId))
            ) {
              if (!destroyedLinks.includes(links[i].id)) {
                destroyedLinks.push(links[i].id);
              }
              links.splice(i, 1);
            }
          }
        }
      }
    }

    return { destroyedLinks, collapsedNodes };
  }

  findDisconnectedNodes(
    playerId: string,
    nodes: GameNode[],
    links: GameLink[]
  ): string[] {
    const playerNodes = nodes.filter((n) => n.owner === playerId);
    const coreNode = playerNodes.find((n) => n.isCore);
    if (!coreNode) return playerNodes.map((n) => n.id);

    // BFS from core node
    const visited = new Set<string>();
    const queue: string[] = [coreNode.id];
    visited.add(coreNode.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const connectedLinks = links.filter(
        (l) =>
          l.owner === playerId &&
          (l.fromNodeId === current || l.toNodeId === current)
      );

      for (const link of connectedLinks) {
        const neighborId =
          link.fromNodeId === current ? link.toNodeId : link.fromNodeId;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    // Return nodes NOT reachable from core
    return playerNodes
      .filter((n) => !visited.has(n.id) && !n.isCore)
      .map((n) => n.id);
  }

  destroyLink(
    linkId: string,
    playerId: string,
    links: GameLink[],
    nodes: GameNode[]
  ): { success: boolean; disconnectedNodes: string[] } {
    const linkIdx = links.findIndex((l) => l.id === linkId && l.owner === playerId);
    if (linkIdx === -1) return { success: false, disconnectedNodes: [] };

    const link = links[linkIdx];
    links.splice(linkIdx, 1);

    const disconnected = this.findDisconnectedNodes(playerId, nodes, links);
    for (const nodeId of disconnected) {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && !node.isCore) {
        node.owner = null;
        node.energy = 0;
      }
    }

    // Remove orphan links
    for (let i = links.length - 1; i >= 0; i--) {
      if (
        links[i].owner === playerId &&
        (disconnected.includes(links[i].fromNodeId) ||
          disconnected.includes(links[i].toNodeId))
      ) {
        links.splice(i, 1);
      }
    }

    return { success: true, disconnectedNodes: disconnected };
  }
}
