import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../shared/services/notification.service';

@Component({
  selector: 'app-payment-return',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <div class="card">
        <div *ngIf="isLoading" class="loading-spinner"></div>
        <h2 *ngIf="!isLoading">{{ title }}</h2>
        <p *ngIf="!isLoading">{{ message }}</p>
        <p *ngIf="!isLoading && countdown > 0" class="countdown-message">
          Sẽ tự động chuyển hướng về trang P2P sau {{ countdown }} giây...
        </p>
        <button *ngIf="!isLoading" (click)="navigateToP2P()" class="btn-primary">
          Về trang P2P
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./payment-return.component.scss']
})
export class PaymentReturnComponent implements OnInit {
  isLoading = true;
  title = 'Đang xử lý...';
  message = 'Vui lòng chờ trong giây lát.';
  countdown = 5;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params: Params) => {
      const responseCode = params['vnp_ResponseCode'];
      this.isLoading = false;

      if (responseCode === '00') {
        this.title = '✅ Giao dịch thành công!';
        this.message = 'Tiền đã được nạp. Vui lòng kiểm tra ví của bạn sau ít phút.';
        this.notificationService.show(this.message, 'success');
      } else {
        this.title = '❌ Giao dịch thất bại!';
        this.message = `Đã có lỗi xảy ra. Mã lỗi: ${responseCode}. Vui lòng thử lại.`;
        this.notificationService.show(this.message, 'error');
      }

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          clearInterval(interval);
          this.navigateToP2P();
        }
      }, 1000);
    });
  }

  navigateToP2P(): void {
    this.router.navigate(['/p2p']);
  }
}