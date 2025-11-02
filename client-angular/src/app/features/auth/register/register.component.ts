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
import { Router, RouterModule } from '@angular/router';
import { NotificationService } from '../../../shared/services/notification.service';
import {
  AuthService,
  RegisterRequest,
} from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit, OnDestroy, AfterViewInit {
  formData = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  };

  isLoading = false;
  showPassword = false;
  showConfirmPassword = false;
  animationFrame: number | null = null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private notificationService: NotificationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
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

  togglePasswordVisibility(field: 'password' | 'confirmPassword') {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  onSubmit() {
    // Validate first name
    if (!this.formData.firstName.trim()) {
      this.notificationService.show('First name is required', 'error');
      return;
    }

    // Validate last name
    if (!this.formData.lastName.trim()) {
      this.notificationService.show('Last name is required', 'error');
      return;
    }

    // Validate email
    if (!this.formData.email) {
      this.notificationService.show('Email is required', 'error');
      return;
    }

    if (!this.isValidEmail(this.formData.email)) {
      this.notificationService.show(
        'Please enter a valid email address',
        'error'
      );
      return;
    }

    // Validate password
    if (!this.formData.password) {
      this.notificationService.show('Password is required', 'error');
      return;
    }

    if (this.formData.password.length < 6) {
      this.notificationService.show(
        'Password must be at least 6 characters',
        'error'
      );
      return;
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
    if (!passwordRegex.test(this.formData.password)) {
      this.notificationService.show(
        'Mật khẩu phải có ít nhất một chữ hoa, một chữ thường, một số và một ký tự đặc biệt (@$!%*?&)',
        'error'
      );
      return;
    }

    // Validate confirm password
    if (!this.formData.confirmPassword) {
      this.notificationService.show('Please confirm your password', 'error');
      return;
    }

    if (this.formData.password !== this.formData.confirmPassword) {
      this.notificationService.show('Passwords do not match', 'error');
      return;
    }

    this.isLoading = true;

    const registerRequest: RegisterRequest = {
      email: this.formData.email,
      password: this.formData.password,
      confirmPassword: this.formData.confirmPassword,
      firstName: this.formData.firstName,
      lastName: this.formData.lastName,
    };

    this.authService.register(registerRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          this.notificationService.show(
            'Tài khoản đã được tạo thành công! Vui lòng kiểm tra email để xác thực.',
            'success'
          );
          this.router.navigate(['/login']);
        } else {
          // Show detailed validation errors if available
          let errorMessage = response.message || 'Đăng ký thất bại';
          if (response.errors && response.errors.length > 0) {
            errorMessage = response.errors.join(', ');
          }
          this.notificationService.show(errorMessage, 'error');
        }
      },
      error: (error) => {
        this.isLoading = false;
        let errorMessage = 'Có lỗi xảy ra khi đăng ký';

        // Register error

        // Handle HTTP error response
        if (error.error) {
          // Server returned an error response
          if (error.error.errors && error.error.errors.length > 0) {
            errorMessage = error.error.errors.join(', ');
          } else if (error.error.message) {
            errorMessage = error.error.message;
          }
        } else if (error.message) {
          // Network or other error
          errorMessage = error.message;
        }

        this.notificationService.show(errorMessage, 'error');
      },
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isFormValid(): boolean {
    return !!(
      this.formData.firstName &&
      this.formData.lastName &&
      this.formData.email &&
      this.formData.password &&
      this.formData.confirmPassword &&
      this.formData.password === this.formData.confirmPassword
    );
  }

  passwordsMatch(): boolean {
    return this.formData.password === this.formData.confirmPassword;
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToHome() {
    this.router.navigate(['/home']);
  }
}
