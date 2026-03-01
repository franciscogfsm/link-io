// ============================================================
// LINK.IO Client - Camera System
// Pan, zoom, smooth interpolation following core node
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupControls();
  }

  private setupControls() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * zoomDelta));
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || e.button === 2) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.camStartX = this.targetX;
        this.camStartY = this.targetY;
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.targetX = this.camStartX - (e.clientX - this.dragStartX) / this.zoom;
        this.targetY = this.camStartY - (e.clientY - this.dragStartY) / this.zoom;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  followTarget(worldX: number, worldY: number): void {
    if (!this.isDragging) {
      this.targetX = worldX;
      this.targetY = worldY;
    }
  }

  update(): void {
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
