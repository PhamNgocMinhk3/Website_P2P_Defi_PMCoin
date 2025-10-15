import { AfterViewInit, Component, ElementRef, OnDestroy, Inject, PLATFORM_ID, Renderer2 } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as AOS from 'aos';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements AfterViewInit, OnDestroy {

  private resizeListener!: () => void;
  private animationFrameId!: number;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private el: ElementRef,
    private router: Router,
    private renderer2: Renderer2
  ) {}

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Initialize Animate On Scroll library
      AOS.init({
        duration: 800,
        once: true,
        offset: 100,
      });

      this.initThreeJs();
      this.showContent();
    }
  }

  private showContent(): void {
    const contentWrapper = this.el.nativeElement.querySelector('.content-wrapper');
    if (contentWrapper) {
      setTimeout(() => {
        this.renderer2.addClass(contentWrapper, 'visible');
      }, 100);
    }
  }

  private initThreeJs(): void {
    const container = this.el.nativeElement.querySelector('#nebula-container');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const cameraShakeGroup = new THREE.Group();
    scene.add(cameraShakeGroup);
    cameraShakeGroup.add(camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.03;
    controls.minDistance = 15;
    controls.maxDistance = 150;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.1;

    const particleCount = 200000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount);
    const colorPalette = [ new THREE.Color("#ff4800"), new THREE.Color("#ff8c00"), new THREE.Color("#ffd700"), new THREE.Color("#dc2626"), ];
    const arms = 5;
    const armSpread = 0.5;
    const galaxyRadius = 40;

    for (let i = 0; i < particleCount; i++) { const i3 = i * 3; const armIndex = Math.floor(Math.random() * arms); const angle = (armIndex / arms) * Math.PI * 2; const dist = Math.random() * galaxyRadius; const armAngle = dist * 0.15; const spiralAngle = angle + armAngle + (Math.random() - 0.5) * armSpread; const randomHeight = (Math.random() - 0.5) * 5 * (1 - dist / galaxyRadius); positions[i3] = Math.cos(spiralAngle) * dist; positions[i3 + 1] = Math.sin(spiralAngle) * dist; positions[i3 + 2] = randomHeight; const color = colorPalette[Math.floor(Math.random() * colorPalette.length)]; const lightness = 0.7 + Math.random() * 0.3; colors[i3] = color.r * lightness; colors[i3 + 1] = color.g * lightness; colors[i3 + 2] = color.b * lightness; randoms[i] = Math.random() * 10.0; }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, rippleActive: { value: 0.0 }, rippleTime: { value: 0.0 }, uPointSize: { value: 3.0 * window.devicePixelRatio }, },
      vertexShader: `
        uniform float time;
        uniform float rippleActive;
        uniform float rippleTime;
        uniform float uPointSize;
        attribute vec3 color;
        attribute float aRandom;
        varying vec3 vColor;
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m; m = m*m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }
        void main() {
          vColor = color;
          vec3 pos = position;
          float morphFactor = sin(time * 0.1 + aRandom) * 0.5 + 0.5;
          float noiseFreq = 0.05;
          float noiseAmp = 15.0;
          vec3 nebulaPos = pos;
          nebulaPos.x += snoise(pos.yz * noiseFreq + time * 0.05) * noiseAmp;
          nebulaPos.y += snoise(pos.xz * noiseFreq + time * 0.05) * noiseAmp;
          nebulaPos.z += snoise(pos.xy * noiseFreq + time * 0.05) * noiseAmp;
          pos = mix(pos, nebulaPos, morphFactor);
          float angle = time * 0.05;
          mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          pos.xy = rotation * pos.xy;
          if (rippleActive > 0.5) {
            float timeSinceRipple = time - rippleTime;
            if (timeSinceRipple > 0.0) {
              float waveSpeed = 80.0;
              float waveWidth = 25.0;
              float waveRadius = timeSinceRipple * waveSpeed;
              float distFromCenter = length(pos.xy);
              float distFromWavefront = abs(distFromCenter - waveRadius);
              float profile = exp(-pow(distFromWavefront / waveWidth, 2.0));
              float fadeout = smoothstep(4.0, 2.5, timeSinceRipple);
              float waveInfluence = profile * fadeout;
              if (waveInfluence > 0.01) {
                vec3 dir = normalize(pos);
                pos += dir * waveInfluence * 35.0;
                pos.z += snoise(pos.xy * 0.1 + time * 2.0) * waveInfluence * 10.0;
                vColor += vec3(1.0, 1.0, 1.0) * waveInfluence * 1.5;
              }
            }
          }
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uPointSize / -mvPosition.z;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
          if (r > 1.0) discard;
          float angle = atan(gl_PointCoord.y - 0.5, gl_PointCoord.x - 0.5);
          float spikes = 5.0;
          float star_boundary = cos(angle * spikes) * 0.2 + 0.8;
          float alpha = 1.0 - smoothstep(star_boundary - 0.1, star_boundary, r);
          alpha *= pow(1.0 - r, 0.4);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    camera.position.z = 70;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const baseBloomStrength = 0.45; // Reduced bloom for better readability
    const bloomPass = new UnrealBloomPass( new THREE.Vector2(window.innerWidth, window.innerHeight), baseBloomStrength, 0.4, 0.85);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    const clock = new THREE.Clock();
    let shakeIntensity = 0;
    let bloomPulseTime = -1;

    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      const deltaTime = clock.getDelta();
      const time = (material.uniforms['time'].value as number) + deltaTime;
      material.uniforms['time'].value = time;
      if (bloomPulseTime > 0) { const timeSincePulse = time - bloomPulseTime; if (timeSincePulse < 2.0) { const pulseProgress = timeSincePulse / 2.0; bloomPass.strength = baseBloomStrength + Math.sin(pulseProgress * Math.PI) * 2.0; } else { bloomPass.strength = baseBloomStrength; bloomPulseTime = -1; } }
      if (shakeIntensity > 0) { cameraShakeGroup.position.x = (Math.random() - 0.5) * shakeIntensity; cameraShakeGroup.position.y = (Math.random() - 0.5) * shakeIntensity; shakeIntensity -= deltaTime * 2.0; } else { cameraShakeGroup.position.set(0, 0, 0); }
      if (material.uniforms['rippleActive'].value > 0.5) { const timeSinceRipple = time - (material.uniforms['rippleTime'].value as number); if (timeSinceRipple > 4.0) { material.uniforms['rippleActive'].value = 0.0; } }
      controls.update();
      composer.render();
    };
    animate();

    const rippleBtn = document.createElement('button');
    rippleBtn.id = 'ripple-btn';
    rippleBtn.innerText = 'Unleash Supernova';
    container.appendChild(rippleBtn);
    rippleBtn.addEventListener('click', () => { if (material.uniforms['rippleActive'].value > 0.5) return; material.uniforms['rippleTime'].value = material.uniforms['time'].value; material.uniforms['rippleActive'].value = 1.0; shakeIntensity = 1.0; bloomPulseTime = material.uniforms['time'].value as number; rippleBtn.classList.add('disabled'); setTimeout(() => rippleBtn.classList.remove('disabled'), 4000); });

    this.resizeListener = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
      material.uniforms['uPointSize'].value = 3.0 * window.devicePixelRatio;
    };
    window.addEventListener('resize', this.resizeListener);
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      if (this.resizeListener) {
        window.removeEventListener('resize', this.resizeListener);
      }
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
    }
  }
}