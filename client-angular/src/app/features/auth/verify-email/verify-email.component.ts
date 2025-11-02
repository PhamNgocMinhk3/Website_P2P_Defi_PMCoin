import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { NotificationService } from '../../../shared/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss']
})
export class VerifyEmailComponent implements OnInit {
  isLoading = true;
  isSuccess = false;
  errorMessage = '';
  token = '';
  email = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParams['token'] || '';
    this.email = this.route.snapshot.queryParams['email'] || '';

    if (!this.token || !this.email) {
      this.isLoading = false;
      this.errorMessage = 'Token hoặc email không hợp lệ';
      return;
    }

    this.verifyEmail();
  }

  verifyEmail() {
    this.authService.verifyEmail(this.token, this.email).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          this.isSuccess = true;
          this.notificationService.show('Email đã được xác thực thành công!', 'success');
        } else {
          this.errorMessage = response.message || 'Xác thực email thất bại';
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.message || 'Có lỗi xảy ra khi xác thực email';
      }
    });
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }
}
