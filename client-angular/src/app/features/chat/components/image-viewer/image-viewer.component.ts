import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  HostListener,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.scss'],
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  @Input() images: string[] = [];
  @Input() currentIndex: number = 0;
  @Input() isVisible: boolean = false;

  @Output() close = new EventEmitter<void>();
  @Output() indexChange = new EventEmitter<number>();

  // Zoom and pan state
  zoomLevel: number = 1;
  minZoom: number = 0.5;
  maxZoom: number = 3;
  zoomStep: number = 0.25;

  // Pan state
  panX: number = 0;
  panY: number = 0;
  isDragging: boolean = false;
  lastMouseX: number = 0;
  lastMouseY: number = 0;

  // Touch state for mobile
  initialDistance: number = 0;
  initialZoom: number = 1;
  touchStartX: number = 0;
  touchStartY: number = 0;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    if (this.isVisible && isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = 'hidden';
    }
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (!this.isVisible) return;

    switch (event.key) {
      case 'Escape':
        this.closeViewer();
        break;
      case 'ArrowLeft':
        this.previousImage();
        break;
      case 'ArrowRight':
        this.nextImage();
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case '0':
        this.resetZoom();
        break;
    }
  }

  closeViewer() {
    this.isVisible = false;
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
    this.resetZoom();
    this.close.emit();
  }

  previousImage() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.indexChange.emit(this.currentIndex);
      this.resetZoom();
    }
  }

  nextImage() {
    if (this.currentIndex < this.images.length - 1) {
      this.currentIndex++;
      this.indexChange.emit(this.currentIndex);
      this.resetZoom();
    }
  }

  zoomIn() {
    if (this.zoomLevel < this.maxZoom) {
      this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel + this.zoomStep);
    }
  }

  zoomOut() {
    if (this.zoomLevel > this.minZoom) {
      this.zoomLevel = Math.max(this.minZoom, this.zoomLevel - this.zoomStep);
      this.constrainPan();
    }
  }

  resetZoom() {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
  }

  // Mouse events for desktop
  onMouseDown(event: MouseEvent) {
    if (this.zoomLevel > 1) {
      this.isDragging = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      event.preventDefault();
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isDragging && this.zoomLevel > 1) {
      const deltaX = event.clientX - this.lastMouseX;
      const deltaY = event.clientY - this.lastMouseY;

      this.panX += deltaX;
      this.panY += deltaY;

      this.constrainPan();

      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isDragging = false;
  }

  // Touch events for mobile
  onTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      // Single touch - start pan
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      // Two finger touch - start zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      this.initialDistance = this.getDistance(touch1, touch2);
      this.initialZoom = this.zoomLevel;
    }
    event.preventDefault();
  }

  onTouchMove(event: TouchEvent) {
    if (event.touches.length === 1 && this.zoomLevel > 1) {
      // Single touch - pan
      const deltaX = event.touches[0].clientX - this.touchStartX;
      const deltaY = event.touches[0].clientY - this.touchStartY;

      this.panX += deltaX;
      this.panY += deltaY;

      this.constrainPan();

      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      // Two finger touch - zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const currentDistance = this.getDistance(touch1, touch2);
      const scale = currentDistance / this.initialDistance;

      this.zoomLevel = Math.max(
        this.minZoom,
        Math.min(this.maxZoom, this.initialZoom * scale)
      );
      this.constrainPan();
    }
    event.preventDefault();
  }

  private getDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private constrainPan() {
    const maxPanX = (this.zoomLevel - 1) * 200;
    const maxPanY = (this.zoomLevel - 1) * 150;

    this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
  }

  get currentImage(): string {
    return this.images[this.currentIndex] || '';
  }

  get imageTransform(): string {
    return `scale(${this.zoomLevel}) translate(${
      this.panX / this.zoomLevel
    }px, ${this.panY / this.zoomLevel}px)`;
  }

  get canGoPrevious(): boolean {
    return this.currentIndex > 0;
  }

  get canGoNext(): boolean {
    return this.currentIndex < this.images.length - 1;
  }

  get imageCounter(): string {
    return `${this.currentIndex + 1} of ${this.images.length}`;
  }
}
