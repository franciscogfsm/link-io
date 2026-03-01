// ============================================================
// LINK.IO Client - State Interpolation & Prediction
// Smooth 60fps rendering from 20 TPS server updates
// Includes client-side prediction for local player movement
// ============================================================

import type { GameState, GameNode } from '../../../shared/types';

interface NodeSnapshot {
  x: number;
  y: number;
}

// ---- Client-side prediction constants (mirror server) ----
const MOVE_BASE_SPEED = 200;
const MOVE_MASS_PENALTY = 0.08;
const MOVE_ACCELERATION = 12;
const MOVE_FRICTION = 8;
const SPEED_BONUSES = [1, 1.20, 1.40, 1.70];

export class Interpolation {
  private prevState = new Map<string, NodeSnapshot>();
  private targetState = new Map<string, NodeSnapshot>();
  private lastUpdateTime = 0;
  private updateInterval = 50; // 20 TPS = 50ms

  // Pre-allocated buffer to avoid GC
  private _resultBuffer: GameNode[] = [];

  // ---- Client-side prediction state ----
  private _localPlayerId = '';
  private _localCoreNodeId = '';
  private _localInput: { x: number; y: number } = { x: 0, y: 0 };
  private _localVelocity = { x: 0, y: 0 };
  private _predictedPos: { x: number; y: number } | null = null;
  private _playerNodeCount = 0;
  private _playerSpeedBonus = 1;
  private _playerEnergy = 0;
  private _arenaWidth = 4000;
  private _arenaHeight = 3000;
  // Reconciliation — how fast predicted pos corrects toward server pos
  private _reconcileSpeed = 8;

  // ---- Setup ----
  setLocalPlayer(playerId: string) {
    this._localPlayerId = playerId;
  }

  setInput(direction: { x: number; y: number }) {
    this._localInput.x = direction.x;
    this._localInput.y = direction.y;
  }

  pushState(state: GameState): void {
    // Swap target → prev (reuse maps, avoid allocation)
    const tmp = this.prevState;
    this.prevState = this.targetState;
    this.targetState = tmp;
    this.targetState.clear();

    for (const node of state.nodes) {
      this.targetState.set(node.id, { x: node.position.x, y: node.position.y });
    }

    this.lastUpdateTime = performance.now();
    this._arenaWidth = state.arenaWidth;
    this._arenaHeight = state.arenaHeight;

    // Update local player info for prediction
    if (this._localPlayerId) {
      const localPlayer = state.players.find(p => p.id === this._localPlayerId);
      if (localPlayer) {
        this._localCoreNodeId = localPlayer.coreNodeId;
        this._playerNodeCount = localPlayer.nodeCount;
        this._playerSpeedBonus = SPEED_BONUSES[localPlayer.upgrades.speed] ?? 1;
        this._playerEnergy = localPlayer.energy;

        // Server reconciliation: handle large discrepancies
        const serverCorePos = this.targetState.get(this._localCoreNodeId);
        if (serverCorePos && this._predictedPos) {
          const dx = serverCorePos.x - this._predictedPos.x;
          const dy = serverCorePos.y - this._predictedPos.y;
          const distSq = dx * dx + dy * dy;
          // Large discrepancy (teleport/warp/respawn) → snap immediately
          if (distSq > 200 * 200) {
            this._predictedPos.x = serverCorePos.x;
            this._predictedPos.y = serverCorePos.y;
            this._localVelocity.x = 0;
            this._localVelocity.y = 0;
          }
        } else if (serverCorePos && !this._predictedPos) {
          this._predictedPos = { x: serverCorePos.x, y: serverCorePos.y };
        }
      }
    }
  }

  /**
   * Run client-side prediction for the local player's core node.
   * Call this every render frame with the frame deltaTime (seconds).
   */
  predict(dt: number): void {
    if (!this._predictedPos || !this._localCoreNodeId) return;

    const vel = this._localVelocity;
    const input = this._localInput;

    // Mass-based max speed (mirrors server)
    const massFactor = Math.max(0.15, 1 - this._playerNodeCount * MOVE_MASS_PENALTY);
    const maxSpeed = MOVE_BASE_SPEED * massFactor * this._playerSpeedBonus;

    if ((input.x !== 0 || input.y !== 0) && this._playerEnergy > 1) {
      vel.x += input.x * maxSpeed * MOVE_ACCELERATION * dt;
      vel.y += input.y * maxSpeed * MOVE_ACCELERATION * dt;
    } else {
      vel.x *= Math.max(0, 1 - MOVE_FRICTION * dt);
      vel.y *= Math.max(0, 1 - MOVE_FRICTION * dt);
    }

    // Clamp speed
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (speed > maxSpeed) {
      const inv = maxSpeed / speed;
      vel.x *= inv;
      vel.y *= inv;
    }
    if (Math.abs(vel.x) < 0.5 && Math.abs(vel.y) < 0.5) { vel.x = 0; vel.y = 0; }

    // Apply velocity
    this._predictedPos.x += vel.x * dt;
    this._predictedPos.y += vel.y * dt;

    // Arena bounds
    this._predictedPos.x = Math.max(20, Math.min(this._arenaWidth - 20, this._predictedPos.x));
    this._predictedPos.y = Math.max(20, Math.min(this._arenaHeight - 20, this._predictedPos.y));

    // Smooth reconciliation toward server position
    const serverPos = this.targetState.get(this._localCoreNodeId);
    if (serverPos) {
      const blendFactor = 1 - Math.exp(-this._reconcileSpeed * dt);
      this._predictedPos.x += (serverPos.x - this._predictedPos.x) * blendFactor;
      this._predictedPos.y += (serverPos.y - this._predictedPos.y) * blendFactor;
    }
  }

  /** Get the predicted position (used by camera to follow without waiting for interp). */
  get predictedPosition(): { x: number; y: number } | null {
    return this._predictedPos;
  }

  interpolateNodes(nodes: GameNode[]): GameNode[] {
    const now = performance.now();
    const elapsed = now - this.lastUpdateTime;
    // Allow slight extrapolation past 1.0 so nodes don't freeze between server ticks
    const t = Math.min(elapsed / this.updateInterval, 1.5);

    // Reuse buffer
    if (this._resultBuffer.length !== nodes.length) {
      this._resultBuffer = new Array(nodes.length);
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // For local player's core: use predicted position (instant response)
      if (node.id === this._localCoreNodeId && this._predictedPos) {
        if (this._resultBuffer[i] && this._resultBuffer[i].id === node.id) {
          const r = this._resultBuffer[i];
          Object.assign(r, node);
          r.position = { x: this._predictedPos.x, y: this._predictedPos.y };
        } else {
          this._resultBuffer[i] = {
            ...node,
            position: { x: this._predictedPos.x, y: this._predictedPos.y },
          };
        }
        continue;
      }

      const prev = this.prevState.get(node.id);
      const target = this.targetState.get(node.id);

      if (prev && target) {
        const interpX = prev.x + (target.x - prev.x) * t;
        const interpY = prev.y + (target.y - prev.y) * t;

        if (this._resultBuffer[i] && this._resultBuffer[i].id === node.id) {
          const r = this._resultBuffer[i];
          Object.assign(r, node);
          r.position = { x: interpX, y: interpY };
        } else {
          this._resultBuffer[i] = {
            ...node,
            position: { x: interpX, y: interpY },
          };
        }
      } else {
        this._resultBuffer[i] = node;
      }
    }

    return this._resultBuffer;
  }
}
