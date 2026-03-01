// ============================================================
// LINK.IO Client - Input Handler
// Mouse/touch input for link creation and camera
// ============================================================

import type { GameNode } from '../../../shared/types';
import { Camera } from './Camera';

export interface LinkDragState {
  active: boolean;
  fromNodeId: string | null;
  mouseX: number;
  mouseY: number;
}

const MAX_LINK_DISTANCE = 350;

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private nodes: GameNode[] = [];
  private links: { fromNodeId: string; toNodeId: string }[] = [];
  private onCreateLink: ((fromNodeId: string, toNodeId: string) => void) | null = null;
  private _dragState: LinkDragState = { active: false, fromNodeId: null, mouseX: 0, mouseY: 0 };
  private playerId: string = '';
  private hoverNodeId: string | null = null;
  private _validTargets: string[] = [];
  private clickRadius = 45; // larger for easier clicking!

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.setupEvents();
  }

  get dragState(): LinkDragState {
    return this._dragState;
  }

  get hoveredNodeId(): string | null {
    return this.hoverNodeId;
  }

  get validTargets(): string[] {
    return this._validTargets;
  }

  setNodes(nodes: GameNode[]) {
    this.nodes = nodes;
  }

  setLinks(links: { fromNodeId: string; toNodeId: string }[]) {
    this.links = links;
  }

  setPlayerId(id: string) {
    this.playerId = id;
    console.log('[LINK.IO Input] Player ID set:', id);
  }

  setOnCreateLink(callback: (fromNodeId: string, toNodeId: string) => void) {
    this.onCreateLink = callback;
  }

  private updateValidTargets(): void {
    if (!this._dragState.active || !this._dragState.fromNodeId) {
      this._validTargets = [];
      return;
    }

    const fromNode = this.nodes.find(n => n.id === this._dragState.fromNodeId);
    if (!fromNode) {
      this._validTargets = [];
      return;
    }

    this._validTargets = this.nodes
      .filter(n => {
        if (n.id === this._dragState.fromNodeId) return false;
        // Distance check
        const dx = n.position.x - fromNode.position.x;
        const dy = n.position.y - fromNode.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > MAX_LINK_DISTANCE) return false;
        // No duplicate links
        const exists = this.links.some(
          l =>
            (l.fromNodeId === fromNode.id && l.toNodeId === n.id) ||
            (l.fromNodeId === n.id && l.toNodeId === fromNode.id)
        );
        if (exists) return false;
        return true;
      })
      .map(n => n.id);
  }

  private setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const world = this.camera.screenToWorld(e.clientX, e.clientY);
      const node = this.findNodeAt(world.x, world.y);

      if (node && node.owner === this.playerId) {
        console.log('[LINK.IO Input] Started drag from node:', node.id, 'at', node.position);
        this._dragState = {
          active: true,
          fromNodeId: node.id,
          mouseX: e.clientX,
          mouseY: e.clientY,
        };
        this.updateValidTargets();
      } else if (node) {
        console.log('[LINK.IO Input] Clicked node not owned by us. Owner:', node.owner, 'Us:', this.playerId);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const world = this.camera.screenToWorld(e.clientX, e.clientY);
      this.hoverNodeId = this.findNodeAt(world.x, world.y)?.id || null;

      if (this._dragState.active) {
        this._dragState.mouseX = e.clientX;
        this._dragState.mouseY = e.clientY;
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this._dragState.active) return;

      const world = this.camera.screenToWorld(e.clientX, e.clientY);
      const targetNode = this.findNodeAt(world.x, world.y);

      if (targetNode && this._dragState.fromNodeId && targetNode.id !== this._dragState.fromNodeId) {
        console.log('[LINK.IO Input] Creating link:', this._dragState.fromNodeId, '->', targetNode.id);
        this.onCreateLink?.(this._dragState.fromNodeId, targetNode.id);
      } else {
        console.log('[LINK.IO Input] Drag released without valid target');
      }

      this._dragState = { active: false, fromNodeId: null, mouseX: 0, mouseY: 0 };
      this._validTargets = [];
    });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const world = this.camera.screenToWorld(touch.clientX, touch.clientY);
      const node = this.findNodeAt(world.x, world.y);

      if (node && node.owner === this.playerId) {
        this._dragState = {
          active: true,
          fromNodeId: node.id,
          mouseX: touch.clientX,
          mouseY: touch.clientY,
        };
        this.updateValidTargets();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this._dragState.active) {
        const touch = e.touches[0];
        this._dragState.mouseX = touch.clientX;
        this._dragState.mouseY = touch.clientY;
      }
    });

    this.canvas.addEventListener('touchend', (e) => {
      if (!this._dragState.active) return;
      const touch = e.changedTouches[0];
      const world = this.camera.screenToWorld(touch.clientX, touch.clientY);
      const targetNode = this.findNodeAt(world.x, world.y);

      if (targetNode && this._dragState.fromNodeId && targetNode.id !== this._dragState.fromNodeId) {
        this.onCreateLink?.(this._dragState.fromNodeId, targetNode.id);
      }

      this._dragState = { active: false, fromNodeId: null, mouseX: 0, mouseY: 0 };
      this._validTargets = [];
    });
  }

  private findNodeAt(worldX: number, worldY: number): GameNode | undefined {
    let closest: GameNode | undefined;
    let closestDist = Infinity;

    for (const node of this.nodes) {
      const dx = node.position.x - worldX;
      const dy = node.position.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Use generous click radius, even bigger for core nodes
      const baseRadius = node.isCore ? this.clickRadius * 1.5 : this.clickRadius;
      const effectiveRadius = Math.max(node.radius * 2, baseRadius / this.camera.zoom);

      if (dist < effectiveRadius && dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }

    return closest;
  }

  destroy(): void {
    // Listeners auto-clean on canvas removal
  }
}
