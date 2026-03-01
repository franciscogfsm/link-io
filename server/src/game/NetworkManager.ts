// ============================================================
// LINK.IO Server - Network Manager
// Handles energy networks, links, flow, and combat
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { GameNode, GameLink, Player } from '../../../shared/types.js';

export class NetworkManager {
  private linkCostBase = 6;
  private linkCostPerDistance = 0.012;
  private maxLinkDistance = 350;
  private baseEnergyPerNode = 1.2;     // nerfed from 2.5
  private combatDamagePerSecond = 25;
  private networkBonusMultiplier = 0.06; // nerfed from 0.15
  private captureSpeed = 25; // % per second — 4s to capture a node
  private siphonRate = 3; // energy stolen per second per attacking link

  createLink(
    fromNodeId: string,
    toNodeId: string,
    playerId: string,
    nodes: GameNode[],
    links: GameLink[],
    player: Player,
    reachMultiplier: number = 1
  ): GameLink | null {
    const fromNode = nodes.find((n) => n.id === fromNodeId);
    const toNode = nodes.find((n) => n.id === toNodeId);
    if (!fromNode || !toNode) return null;

    const dx = toNode.position.x - fromNode.position.x;
    const dy = toNode.position.y - fromNode.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.maxLinkDistance * reachMultiplier) return null;

    if (fromNode.owner !== playerId) return null;

    // No duplicate links
    const existingLink = links.find(
      (l) =>
        (l.fromNodeId === fromNodeId && l.toNodeId === toNodeId) ||
        (l.fromNodeId === toNodeId && l.toNodeId === fromNodeId)
    );
    if (existingLink) return null;

    // Cost: attacking enemy nodes costs more
    const isEnemyNode = toNode.owner !== null && toNode.owner !== playerId;
    const attackMultiplier = isEnemyNode ? 1.8 : 1.0;
    // Efficiency upgrade reduces link cost
    const efficiencyDiscount = 1 - [0, 0.20, 0.35, 0.50][player.upgrades.efficiency];
    const cost = (this.linkCostBase + distance * this.linkCostPerDistance) * attackMultiplier * efficiencyDiscount;
    if (player.energy < cost) return null;

    player.energy -= cost;

    // Claim neutral nodes immediately
    if (toNode.owner === null) {
      toNode.owner = playerId;
    }

    const link: GameLink = {
      id: uuidv4(),
      fromNodeId,
      toNodeId,
      owner: playerId,
      health: isEnemyNode ? 60 : 100,
      maxHealth: 100,
      energyFlow: 0,
      shielded: false,
    };

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

      const ownedNodes = nodes.filter((n) => n.owner === player.id);
      const nodeCount = ownedNodes.length;
      const linkCount = links.filter((l) => l.owner === player.id).length;

      // Network bonus  
      const networkMultiplier = 1 + (nodeCount - 1) * this.networkBonusMultiplier;
      const territoryBonus = nodeCount >= 10 ? 1.0 : nodeCount >= 5 ? 0.4 : 0; // nerfed from 3/1.5
      // Flow upgrade bonus (nerfed from 0.30/0.60/1.0)
      const flowBonus = 1 + [0, 0.15, 0.30, 0.50][player.upgrades.flow];

      for (const node of ownedNodes) {
        if (!node.isCore) {
          const nodeMultiplier = node.isMegaNode ? 5 : node.isPowerNode ? 3 : 1;
          const generation = (this.baseEnergyPerNode * networkMultiplier * nodeMultiplier + territoryBonus) * flowBonus * deltaTime;
          player.energy += generation;
          node.energy = Math.min(node.energy + generation * 0.5, 100);
        }
      }

      // Core always generates a base amount (nerfed from 1.5)
      const coreNode = ownedNodes.find((n) => n.isCore);
      if (coreNode) {
        player.energy += 0.8 * deltaTime;
      }

      player.nodeCount = nodeCount;
      player.linkCount = linkCount;
      player.energy = Math.min(player.energy, 999);
    }

    // NODE CAPTURE: links connecting to enemy nodes gradually steal them
    for (const link of links) {
      const toNode = nodes.find((n) => n.id === link.toNodeId);
      if (!toNode || toNode.isCore) continue;

      // If this link reaches an enemy node, start capture
      if (toNode.owner !== null && toNode.owner !== link.owner && !link.shielded) {
        // Reduce node "loyalty" (stored in energy) then flip ownership
        toNode.energy -= this.captureSpeed * deltaTime;
        if (toNode.energy <= 0) {
          const previousOwner = toNode.owner;
          toNode.owner = link.owner;
          toNode.energy = 20;

          // Remove all links from the previous owner to this node
          for (let i = links.length - 1; i >= 0; i--) {
            if (links[i].owner === previousOwner &&
                (links[i].fromNodeId === toNode.id || links[i].toNodeId === toNode.id)) {
              links.splice(i, 1);
            }
          }
        }

        // Siphon: steal energy from enemy while attacking
        const enemyPlayer = players.find((p) => p.id === toNode.owner);
        const attacker = players.find((p) => p.id === link.owner);
        if (enemyPlayer && attacker && enemyPlayer.energy > 0) {
          const siphonBonus = 1 + [0, 0.40, 0.80, 1.50][attacker.upgrades.siphon];
          const siphon = Math.min(this.siphonRate * siphonBonus * deltaTime, enemyPlayer.energy);
          enemyPlayer.energy -= siphon;
          attacker.energy += siphon * 0.7; // 70% efficiency
        }
      }
    }

    // Energy flow visual
    for (const link of links) {
      link.energyFlow = Math.sin(Date.now() * 0.003) * 0.5 + 0.5;
    }
  }

  handleCombat(
    links: GameLink[],
    nodes: GameNode[],
    deltaTime: number,
    players?: Player[]
  ): { destroyedLinks: string[]; collapsedNodes: Map<string, string[]> } {
    const destroyedLinks: string[] = [];
    const collapsedNodes = new Map<string, string[]>();

    // Build set of invulnerable player IDs
    const invulnerable = new Set<string>();
    if (players) {
      for (const p of players) {
        if (p.invulnTimer > 0) invulnerable.add(p.id);
      }
    }

    // Find conflicting links (different owners connecting same nodes)
    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      // Skip damage for invulnerable players' links
      if (invulnerable.has(link.owner)) continue;

      const toNode = nodes.find((n) => n.id === link.toNodeId);
      if (!toNode) continue;

      // If the target node is owned by someone else, damage the link
      // But NOT if the link is shielded or their owner is invulnerable
      if (toNode.owner && toNode.owner !== link.owner && !link.shielded) {
        // Don't deal damage if the node owner is invulnerable
        if (!invulnerable.has(toNode.owner)) {
          link.health -= this.combatDamagePerSecond * deltaTime;
        }
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
