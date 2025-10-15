import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { NotificationService } from '../../../shared/services/notification.service';
import {
  AuthService,
  ResetPasswordRequest,
} from '../../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  newPassword = '';
  confirmPassword = '';
  isLoading = false;
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParams['token'] || '';
    if (!this.token) {
      this.notificationService.show('Token không hợp lệ', 'error');
      this.router.navigate(['/forgot-password']);
    }
  }

  togglePasswordVisibility(field: 'password' | 'confirm') {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  onSubmit() {
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
      token: this.token,
      newPassword: this.newPassword,
      confirmPassword: this.confirmPassword,
    };

    console.log('🔧 Reset Password Request:', resetPasswordRequest);

    this.authService.resetPassword(resetPasswordRequest).subscribe({
      next: (response) => {
        console.log('🔧 Reset Password Response:', response);
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
        console.error('🔧 Reset Password Error:', error);
        this.isLoading = false;
        this.notificationService.show(
          error.message || 'Có lỗi xảy ra khi đặt lại mật khẩu',
          'error'
        );
      },
    });
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }
}
