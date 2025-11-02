import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService, LoginRequest } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy, AfterViewInit {
  email = '';
  password = '';
  isLoading = false;
  showPassword = false;
  animationFrame: number | null = null;
  returnUrl = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private notificationService: NotificationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.returnUrl =
      this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
    this.startBackgroundAnimation();
  }

  ngAfterViewInit() {
    this.initializeAnimations();
  }

  ngOnDestroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private startBackgroundAnimation() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const animate = () => {
      // Floating particles animation
      const particles = document.querySelectorAll('.floating-particle');
      particles.forEach((particle, index) => {
        const element = particle as HTMLElement;
        const currentTransform =
          element.style.transform || 'translate(0px, 0px)';
        const matches = currentTransform.match(
          /translate\(([^,]+)px,\s*([^)]+)px\)/
        );
        const currentX = parseFloat(matches?.[1] || '0');
        const currentY = parseFloat(matches?.[2] || '0');

        const newX = currentX + Math.sin(Date.now() * 0.001 + index) * 0.5;
        const newY = currentY + Math.cos(Date.now() * 0.001 + index) * 0.3;

        element.style.transform = `translate(${newX}px, ${newY}px)`;
      });

      this.animationFrame = requestAnimationFrame(animate);
    };
    animate();
  }

  private initializeAnimations() {
    // GSAP animations would be implemented here
    // GSAP animations initialized
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    // Validate email
    if (!this.email) {
      this.notificationService.show('Email is required', 'error');
      return;
    }

    if (!this.isValidEmail(this.email)) {
      this.notificationService.show(
        'Please enter a valid email address',
        'error'
      );
      return;
    }

    // Validate password
    if (!this.password) {
      this.notificationService.show('Password is required', 'error');
      return;
    }

    if (this.password.length < 6) {
      this.notificationService.show(
        'Password must be at least 6 characters',
        'error'
      );
      return;
    }

    this.isLoading = true;

    const loginRequest: LoginRequest = {
      email: this.email,
      password: this.password,
      rememberMe: false,
    };

    this.authService.login(loginRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          this.notificationService.show('Đăng nhập thành công!', 'success');
          this.router.navigate([this.returnUrl]);
        } else {
          this.notificationService.show(
            response.message || 'Đăng nhập thất bại',
            'error'
          );
        }
      },
      error: () => {
        this.isLoading = false;
        this.notificationService.show(
          'Email hoặc mật khẩu không đúng',
          'error'
        );
      },
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }

  navigateToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }

  navigateToHome() {
    this.router.navigate(['/home']);
  }
}
