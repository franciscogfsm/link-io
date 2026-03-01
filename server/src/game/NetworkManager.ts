// ============================================================
// LINK.IO Server - Network Manager
// Handles energy networks, links, flow, and combat
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { GameNode, GameLink, Player } from '../../../shared/types.js';

export class NetworkManager {
  private linkCostBase = 6;           // reduced from 10 — links easier to afford
  private linkCostPerDistance = 0.015; // reduced from 0.02
  private maxLinkDistance = 350;
  private baseEnergyPerNode = 0.5;     // buffed from 0.3
  private combatDamagePerSecond = 25;
  private networkBonusMultiplier = 0.015;
  private captureSpeed = 20;
  private siphonRate = 0.8;
  // Link decay/repair system
  private linkDecayRate = 2;           // HP/s base decay for fringe links
  private linkRepairRate = 4;          // HP/s repair for core-connected links
  private linkDecayMinLinks = 6;       // decay only kicks in after this many links
  // Reusable maps to avoid per-tick allocations
  private _playerMap = new Map<string, Player>();
  private _nodeMap = new Map<string, GameNode>();
  private _combatNodeMap = new Map<string, GameNode>();
  private _linksByNode = new Map<string, GameLink[]>();
  private _invulnerable = new Set<string>();

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
    // Build player map for O(1) lookups (reuse map)
    const playerMap = this._playerMap;
    playerMap.clear();
    for (const p of players) playerMap.set(p.id, p);

    // Build node map for O(1) lookups (reuse map)
    const nodeMap = this._nodeMap;
    nodeMap.clear();
    for (const n of nodes) nodeMap.set(n.id, n);

    for (const player of players) {
      if (!player.alive) continue;

      let nodeCount = 0;
      let linkCount = 0;
      let hasMega = false;
      let hasPower = false;

      // Count nodes and generate energy in one pass
      const networkMultiplierBase = this.networkBonusMultiplier;
      // First pass: count nodes
      for (const n of nodes) {
        if (n.owner === player.id) nodeCount++;
      }
      for (const l of links) {
        if (l.owner === player.id) linkCount++;
      }

      const networkMultiplier = 1 + (nodeCount - 1) * networkMultiplierBase;
      const territoryBonus = nodeCount >= 15 ? 0.3 : nodeCount >= 8 ? 0.1 : 0;
      const flowBonus = 1 + [0, 0.08, 0.15, 0.25][player.upgrades.flow];

      // Second pass: generate energy per owned node
      for (const node of nodes) {
        if (node.owner !== player.id) continue;
        if (node.isCore) continue;
        const nodeMultiplier = node.isMegaNode ? 5 : node.isPowerNode ? 3 : 1;
        const generation = (this.baseEnergyPerNode * networkMultiplier * nodeMultiplier + territoryBonus) * flowBonus * deltaTime;
        player.energy += generation;
        node.energy = Math.min(node.energy + generation * 0.5, 100);
      }

      // Core passive gen (buffed from 0.2)
      if (nodeCount > 0) {
        player.energy += 0.4 * deltaTime;
      }

      player.nodeCount = nodeCount;
      player.linkCount = linkCount;
      player.energy = Math.min(player.energy, 999);
    }

    // NODE CAPTURE: links connecting to enemy nodes gradually steal them
    for (const link of links) {
      const toNode = nodeMap.get(link.toNodeId);
      if (!toNode || toNode.isCore) continue;

      // If this link reaches an enemy node, start capture
      if (toNode.owner !== null && toNode.owner !== link.owner && !link.shielded) {
        // Reduce node "loyalty" (stored in energy) then flip ownership
        toNode.energy -= this.captureSpeed * deltaTime;
        if (toNode.energy <= 0) {
          const previousOwner = toNode.owner;
          toNode.owner = link.owner;
          toNode.energy = 20;

          // Reward the attacker for capturing a node
          const attacker = playerMap.get(link.owner);
          if (attacker) {
            const captureReward = toNode.isPowerNode ? 8 : toNode.isMegaNode ? 10 : 3;
            attacker.energy += captureReward;
            attacker.score += 25;
            attacker.nodesStolen++;
          }

          // Remove all links from the previous owner to this node
          for (let i = links.length - 1; i >= 0; i--) {
            if (links[i].owner === previousOwner &&
                (links[i].fromNodeId === toNode.id || links[i].toNodeId === toNode.id)) {
              links.splice(i, 1);
            }
          }
        }

        // Siphon: steal energy from enemy while attacking
        const enemyPlayer = playerMap.get(toNode.owner!);
        const attacker = playerMap.get(link.owner);
        if (enemyPlayer && attacker && enemyPlayer.energy > 0) {
          const siphonBonus = 1 + [0, 0.40, 0.80, 1.50][attacker.upgrades.siphon];
          const siphon = Math.min(this.siphonRate * siphonBonus * deltaTime, enemyPlayer.energy);
          enemyPlayer.energy -= siphon;
          attacker.energy += siphon * 0.7; // 70% efficiency
        }
      }
    }

    // Energy flow visual — removed from server, client computes locally
  }

  /**
   * Link decay & repair: links in your core network slowly repair,
   * while fringe/disconnected links slowly decay. Keeps networks fresh
   * and prevents the "too many links" cap from being a hard wall.
   */
  updateLinkDecay(
    links: GameLink[],
    nodes: GameNode[],
    players: Player[],
    deltaTime: number
  ): string[] {
    const decayed: string[] = [];

    // Group link counts by owner
    const linkCounts = new Map<string, number>();
    for (const l of links) {
      linkCounts.set(l.owner, (linkCounts.get(l.owner) || 0) + 1);
    }

    // Build node map
    const nodeMap = this._nodeMap;
    // (already cleared and rebuilt by updateEnergy which runs before this)
    if (nodeMap.size === 0) {
      for (const n of nodes) nodeMap.set(n.id, n);
    }

    // For each player, find which nodes are connected to core (BFS)
    const coreConnected = new Map<string, Set<string>>();
    for (const player of players) {
      if (!player.alive) continue;
      const count = linkCounts.get(player.id) || 0;
      if (count <= this.linkDecayMinLinks) continue; // no decay for small networks

      // BFS from core
      const connected = new Set<string>();
      const coreNode = nodes.find(n => n.id === player.coreNodeId && n.owner === player.id);
      if (!coreNode) continue;

      const queue: string[] = [coreNode.id];
      connected.add(coreNode.id);
      while (queue.length > 0) {
        const current = queue.pop()!;
        for (const link of links) {
          if (link.owner !== player.id) continue;
          let neighbor: string | null = null;
          if (link.fromNodeId === current) neighbor = link.toNodeId;
          else if (link.toNodeId === current) neighbor = link.fromNodeId;
          if (neighbor && !connected.has(neighbor)) {
            const neighborNode = nodeMap.get(neighbor);
            if (neighborNode && neighborNode.owner === player.id) {
              connected.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }
      coreConnected.set(player.id, connected);
    }

    for (let i = links.length - 1; i >= 0; i--) {
      const link = links[i];
      if (link.shielded) continue; // shielded links don't decay

      const count = linkCounts.get(link.owner) || 0;
      if (count <= this.linkDecayMinLinks) {
        // Small network — always repair
        if (link.health < link.maxHealth) {
          link.health = Math.min(link.maxHealth, link.health + this.linkRepairRate * deltaTime);
        }
        continue;
      }

      const connected = coreConnected.get(link.owner);
      const fromNode = nodeMap.get(link.fromNodeId);
      const toNode = nodeMap.get(link.toNodeId);
      const fromConnected = connected?.has(link.fromNodeId) ?? false;
      const toConnected = connected?.has(link.toNodeId) ?? false;
      const bothConnected = fromConnected && toConnected;
      const eitherOwned = (fromNode?.owner === link.owner) && (toNode?.owner === link.owner);

      if (bothConnected && eitherOwned) {
        // Core-connected & both nodes owned — slow repair
        if (link.health < link.maxHealth) {
          link.health = Math.min(link.maxHealth, link.health + this.linkRepairRate * deltaTime);
        }
      } else {
        // Fringe / enemy territory — decay faster with more links
        const overflowFactor = Math.max(1, (count - this.linkDecayMinLinks) / 15);
        link.health -= this.linkDecayRate * overflowFactor * deltaTime;
      }

      if (link.health <= 0) {
        decayed.push(link.id);
      }
    }

    return decayed;
  }

  handleCombat(
    links: GameLink[],
    nodes: GameNode[],
    deltaTime: number,
    players?: Player[]
  ): { destroyedLinks: string[]; collapsedNodes: Map<string, string[]> } {
    const destroyedLinks: string[] = [];
    const collapsedNodes = new Map<string, string[]>();
    // Build node map for O(1) lookups (reuse map)
    const nodeMap = this._combatNodeMap;
    nodeMap.clear();
    for (const n of nodes) nodeMap.set(n.id, n);

    // Build set of invulnerable player IDs (reuse set)
    const invulnerable = this._invulnerable;
    invulnerable.clear();
    if (players) {
      for (const p of players) {
        if (p.invulnTimer > 0) invulnerable.add(p.id);
      }
    }

    // Group links by their node endpoints (reuse map)
    const linksByNode = this._linksByNode;
    linksByNode.clear();
    for (const link of links) {
      let fromList = linksByNode.get(link.fromNodeId);
      if (!fromList) { fromList = []; linksByNode.set(link.fromNodeId, fromList); }
      fromList.push(link);
      let toList = linksByNode.get(link.toNodeId);
      if (!toList) { toList = []; linksByNode.set(link.toNodeId, toList); }
      toList.push(link);
    }

    for (const link of links) {
      if (invulnerable.has(link.owner)) continue;

      const toNode = nodeMap.get(link.toNodeId);
      if (!toNode) continue;

      // If the target node is owned by someone else, damage the link
      if (toNode.owner && toNode.owner !== link.owner && !link.shielded) {
        if (!invulnerable.has(toNode.owner)) {
          link.health -= this.combatDamagePerSecond * deltaTime;
        }
      }

      // Check for counter-links using node-based grouping (avoid O(L²))
      if (!link.shielded) {
        const sharedNodes = [link.fromNodeId, link.toNodeId];
        for (const nodeId of sharedNodes) {
          const neighbors = linksByNode.get(nodeId);
          if (!neighbors) continue;
          for (const otherLink of neighbors) {
            if (otherLink.owner === link.owner || otherLink.id === link.id) continue;
            link.health -= this.combatDamagePerSecond * 0.35 * deltaTime; // halved from 0.7 since we check both endpoints
            break; // only take damage once per shared node
          }
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
          const disconnectedSet = new Set(disconnected);
          // Make disconnected nodes neutral
          for (const nodeId of disconnected) {
            const node = nodeMap.get(nodeId);
            if (node && !node.isCore) {
              node.owner = null;
              node.energy = 0;
            }
          }
          const destroyedSet = new Set(destroyedLinks);
          // Remove links owned by this player that connect to disconnected nodes
          for (let i = links.length - 1; i >= 0; i--) {
            if (
              links[i].owner === link.owner &&
              (disconnectedSet.has(links[i].fromNodeId) ||
                disconnectedSet.has(links[i].toNodeId))
            ) {
              if (!destroyedSet.has(links[i].id)) {
                destroyedLinks.push(links[i].id);
                destroyedSet.add(links[i].id);
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
    // Build adjacency list once for O(1) neighbor lookups during BFS
    const adjacency = new Map<string, string[]>();
    for (const l of links) {
      if (l.owner !== playerId) continue;
      const fromList = adjacency.get(l.fromNodeId) || [];
      fromList.push(l.toNodeId);
      adjacency.set(l.fromNodeId, fromList);
      const toList = adjacency.get(l.toNodeId) || [];
      toList.push(l.fromNodeId);
      adjacency.set(l.toNodeId, toList);
    }

    let coreId: string | null = null;
    const playerNodeIds: string[] = [];
    for (const n of nodes) {
      if (n.owner !== playerId) continue;
      if (n.isCore) coreId = n.id;
      else playerNodeIds.push(n.id);
    }
    if (!coreId) return playerNodeIds;

    // BFS from core node using adjacency list
    const visited = new Set<string>();
    const queue: string[] = [coreId];
    visited.add(coreId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    // Return nodes NOT reachable from core
    const disconnected: string[] = [];
    for (const id of playerNodeIds) {
      if (!visited.has(id)) disconnected.push(id);
    }
    return disconnected;
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
    const disconnectedSet = new Set(disconnected);
    for (const nodeId of disconnected) {
      const nodeIdx = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIdx !== -1 && !nodes[nodeIdx].isCore) {
        nodes[nodeIdx].owner = null;
        nodes[nodeIdx].energy = 0;
      }
    }

    // Remove orphan links
    for (let i = links.length - 1; i >= 0; i--) {
      if (
        links[i].owner === playerId &&
        (disconnectedSet.has(links[i].fromNodeId) ||
          disconnectedSet.has(links[i].toNodeId))
      ) {
        links.splice(i, 1);
      }
    }

    return { success: true, disconnectedNodes: disconnected };
  }
}
