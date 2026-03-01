// ============================================================
// LINK.IO Client - Camera System
// Free-look panning, zoom, smooth following, snap-back
// ============================================================

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  targetX = 0;
  targetY = 0;
  targetZoom = 1;
  private minZoom = 0.3;
  private maxZoom = 2.5;
  private smoothing = 0.08;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartX = 0;
  private camStartY = 0;
  private canvas: HTMLCanvasElement;

  // Free-look mode: when the player pans, stop auto-following
  private _freeLook = false;
  private freeLookTimer = 0;
  private freeLookTimeout = 4; // seconds before auto-snap back
  private coreX = 0; // last known core position
  private coreY = 0;

  // Edge pan: auto-pan when mouse is near edges during drag
  private mouseScreenX = 0;
  private mouseScreenY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupControls();
  }

  get freeLook(): boolean {
    return this._freeLook;
  }

  private setupControls() {
    // Zoom with scroll
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * zoomDelta));
    }, { passive: false });

    // Right-click or middle-click to pan
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || e.button === 2) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.camStartX = this.targetX;
        this.camStartY = this.targetY;
        this._freeLook = true; // Enter free look on pan
        this.freeLookTimer = 0;
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.mouseScreenX = e.clientX;
      this.mouseScreenY = e.clientY;

      if (this.isDragging) {
        const dx = (e.clientX - this.dragStartX) / this.zoom;
        const dy = (e.clientY - this.dragStartY) / this.zoom;
        this.targetX = this.camStartX - dx;
        this.targetY = this.camStartY - dy;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 1 || e.button === 2) {
        this.isDragging = false;
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Space to snap back to core
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this._freeLook = false;
        this.targetX = this.coreX;
        this.targetY = this.coreY;
        this.freeLookTimer = 0;
      }
    });
  }

  followTarget(worldX: number, worldY: number): void {
    this.coreX = worldX;
    this.coreY = worldY;

    if (!this._freeLook && !this.isDragging) {
      this.targetX = worldX;
      this.targetY = worldY;
    }
  }

  update(deltaTime = 0.016): void {
    // Auto snap back after timeout
    if (this._freeLook && !this.isDragging) {
      this.freeLookTimer += deltaTime;
      if (this.freeLookTimer >= this.freeLookTimeout) {
        this._freeLook = false;
        this.targetX = this.coreX;
        this.targetY = this.coreY;
      }
    }

    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;
    this.zoom += (this.targetZoom - this.zoom) * this.smoothing;
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: (screenX - w / 2) / this.zoom + this.x,
      y: (screenY - h / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: (worldX - this.x) * this.zoom + w / 2,
      y: (worldY - this.y) * this.zoom + h / 2,
    };
  }

  destroy(): void {
    // Listeners auto-clean on canvas removal
  }
}
