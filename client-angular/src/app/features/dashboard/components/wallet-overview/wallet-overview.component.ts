import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalletData } from '../../../../core/services/wallet.service';

@Component({
  selector: 'app-wallet-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wallet-overview.component.html',
  styleUrls: ['./wallet-overview.component.scss'],
})
export class WalletOverviewComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  @Input() walletData?: WalletData;
  @Output() toggleCurrency = new EventEmitter<void>();
  @ViewChild('coin3dContainer', { static: false }) coin3dContainer!: ElementRef;

  private scene?: any;
  private camera?: any;
  private renderer?: any;
  private coinMesh?: any;
  private animationId?: number;

  constructor() {}

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    this.init3DCoin();
    this.setupHoverEffects();
  }

  ngOnDestroy(): void {
    this.cleanup3D();
  }

  private init3DCoin(): void {
    if (typeof window === 'undefined' || !(window as any).THREE) {
      // Three.js not loaded, using fallback
      return;
    }

    const THREE = (window as any).THREE;
    const container = this.coin3dContainer.nativeElement;

    // Scene setup
    this.scene = new THREE.Scene();

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.camera.position.z = 3;

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(120, 120);
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    // Create coin geometry
    const geometry = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 32);

    // Create materials
    const frontMaterial = new THREE.MeshPhongMaterial({
      color: 0x4f46e5,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
    });

    const sideMaterial = new THREE.MeshPhongMaterial({
      color: 0x3730a3,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
    });

    const materials = [
      sideMaterial, // side
      frontMaterial, // top
      frontMaterial, // bottom
    ];

    this.coinMesh = new THREE.Mesh(geometry, materials);
    this.scene.add(this.coinMesh);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x4f46e5, 0.5, 10);
    pointLight.position.set(0, 0, 2);
    this.scene.add(pointLight);

    // Start animation
    this.animate();
  }

  private animate(): void {
    if (!this.renderer || !this.scene || !this.camera || !this.coinMesh) {
      return;
    }

    this.animationId = requestAnimationFrame(() => this.animate());

    // Rotate the coin
    this.coinMesh.rotation.y += 0.01;
    this.coinMesh.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;

    this.renderer.render(this.scene, this.camera);
  }

  private setupHoverEffects(): void {
    if (typeof window === 'undefined' || !(window as any).gsap) {
      return;
    }

    const gsap = (window as any).gsap;
    const container = this.coin3dContainer.nativeElement.parentElement;

    if (container) {
      container.addEventListener('mouseenter', () => {
        if (this.coinMesh) {
          gsap.to(this.coinMesh.scale, {
            duration: 0.3,
            x: 1.2,
            y: 1.2,
            z: 1.2,
            ease: 'power2.out',
          });

          gsap.to(this.coinMesh.rotation, {
            duration: 0.3,
            y: this.coinMesh.rotation.y + Math.PI * 2,
            ease: 'power2.out',
          });
        }
      });

      container.addEventListener('mouseleave', () => {
        if (this.coinMesh) {
          gsap.to(this.coinMesh.scale, {
            duration: 0.3,
            x: 1,
            y: 1,
            z: 1,
            ease: 'power2.out',
          });
        }
      });
    }
  }

  private cleanup3D(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    if (this.renderer) {
      this.renderer.dispose();
      const container = this.coin3dContainer?.nativeElement;
      if (container && this.renderer.domElement) {
        container.removeChild(this.renderer.domElement);
      }
    }

    if (this.scene) {
      this.scene.clear();
    }
  }

  // Utility methods
  formatCurrency(value: number, currency: string = 'USD'): string {
    if (currency === 'VND') {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      }).format(value);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  }

  onToggleCurrency(): void {
    this.toggleCurrency.emit();
  }
}
