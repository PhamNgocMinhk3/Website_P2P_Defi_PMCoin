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
import {
  AuthService,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  // Forgot password properties
  email = '';
  isLoading = false;
  isEmailSent = false;

  // Reset password properties
  isResetMode = false;
  resetToken = '';
  newPassword = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;

  animationFrame: number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private notificationService: NotificationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    // Check if this is reset password mode
    this.resetToken = this.route.snapshot.queryParams['token'] || '';
    if (this.resetToken) {
      this.isResetMode = true;
    }
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

        const newX = currentX + Math.sin(Date.now() * 0.001 + index) * 0.4;
        const newY = currentY + Math.cos(Date.now() * 0.001 + index) * 0.2;

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

    this.isLoading = true;

    const forgotPasswordRequest: ForgotPasswordRequest = {
      email: this.email,
    };

    this.authService.forgotPassword(forgotPasswordRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          this.isEmailSent = true;
          this.notificationService.show(
            'Link đặt lại mật khẩu đã được gửi đến email của bạn!',
            'success'
          );
        } else {
          this.notificationService.show(
            response.message || 'Có lỗi xảy ra',
            'error'
          );
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.notificationService.show(
          error.message || 'Có lỗi xảy ra khi gửi email',
          'error'
        );
      },
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  resendEmail() {
    this.isEmailSent = false;
    this.onSubmit();
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToHome() {
    this.router.navigate(['/home']);
  }

  // Reset password methods
  togglePasswordVisibility(field: 'password' | 'confirm') {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  onResetPasswordSubmit() {
    // Validate password
    if (!this.newPassword) {
      this.notificationService.show('Mật khẩu mới là bắt buộc', 'error');
      return;
    }

    if (this.newPassword.length < 6) {
      this.notificationService.show(
        'Mật khẩu phải có ít nhất 6 ký tự',
        'error'
      );
      return;
    }

    // Validate password strength
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
    if (!passwordRegex.test(this.newPassword)) {
      this.notificationService.show(
        'Mật khẩu phải có ít nhất một chữ hoa, một chữ thường, một số và một ký tự đặc biệt',
        'error'
      );
      return;
    }

    // Validate confirm password
    if (!this.confirmPassword) {
      this.notificationService.show('Vui lòng xác nhận mật khẩu', 'error');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.notificationService.show('Mật khẩu không khớp', 'error');
      return;
    }

    this.isLoading = true;

    const resetPasswordRequest: ResetPasswordRequest = {
      token: this.resetToken,
      newPassword: this.newPassword,
      confirmPassword: this.confirmPassword,
    };

    this.authService.resetPassword(resetPasswordRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          this.notificationService.show(
            'Mật khẩu đã được đặt lại thành công!',
            'success'
          );
          this.router.navigate(['/login']);
        } else {
          this.notificationService.show(
            response.message || 'Đặt lại mật khẩu thất bại',
            'error'
          );
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.notificationService.show(
          error.message || 'Có lỗi xảy ra khi đặt lại mật khẩu',
          'error'
        );
      },
    });
  }
}
