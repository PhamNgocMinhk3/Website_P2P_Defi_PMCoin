import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BinanceApiService,
  MarketAnalysis,
} from '../../core/services/binance-api.service';
import { UserSettingsService } from '../../core/services/user-settings.service'; // Import the new service
import { NotificationService } from '../../shared/services/notification.service'; // Import notification service
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analysis.component.html',
  styleUrls: ['./analysis.component.scss'],
})
export class AnalysisComponent implements OnInit, OnDestroy {
  marketData: MarketAnalysis[] = [];
  selectedSymbol: string = 'BTCUSDT';
  selectedAnalysis: MarketAnalysis | null = null;
  isLoading = true;
  lastUpdate: Date = new Date();
  isRealTimeActive = true;
  connectionStatus = 'connecting';
  updateCounter = 0;

  // New property for the email alert feature
  isEmailAlertEnabled: boolean = false;

  private subscription: Subscription = new Subscription();
  private visibilityCheckInterval: any;

  constructor(
    private binanceApi: BinanceApiService,
    private cdr: ChangeDetectorRef,
    private userSettingsService: UserSettingsService, // Inject the service
    private notificationService: NotificationService // Inject notification service
  ) {}

  ngOnInit(): void {
    this.subscribeToMarketData();
    this.startVisibilityCheck();
    this.loadInitialSettings(); // Load user settings on init
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.visibilityCheckInterval) {
      clearInterval(this.visibilityCheckInterval);
    }
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    // Force refresh when window gets focus
    this.refreshData();
  }

  @HostListener('window:visibilitychange')
  onVisibilityChange(): void {
    if (!document.hidden) {
      // Page became visible, force refresh
      this.refreshData();
    }
  }

  private loadInitialSettings(): void {
    this.userSettingsService.getSettings().subscribe({
      next: (settings) => {
        this.isEmailAlertEnabled = settings.emailNotificationEnabled;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load user settings', err);
        this.notificationService.show('Không thể tải cài đặt thông báo.', 'error');
      }
    });
  }

  toggleEmailAlerts(): void {
    this.userSettingsService.toggleEmailNotifications().subscribe({
      next: (response) => {
        if (response.success) {
          this.isEmailAlertEnabled = response.data;
          const message = this.isEmailAlertEnabled
            ? 'Đã bật thông báo phân tích qua email hàng ngày.'
            : 'Đã tắt thông báo qua email.';
          this.notificationService.show(message, 'success');
          this.cdr.detectChanges();
        } else {
          this.notificationService.show(response.message, 'error');
        }
      },
      error: (err) => {
        console.error('Failed to toggle email notifications', err);
        this.notificationService.show('Có lỗi xảy ra khi thay đổi cài đặt.', 'error');
      }
    });
  }

  private subscribeToMarketData(): void {
    this.subscription.add(
      this.binanceApi.marketData$.subscribe({
        next: (data) => {
          console.log('AnalysisComponent: Dữ liệu nhận được từ BinanceApiService:', data);

          this.marketData = data;
          this.isLoading = false;
          this.lastUpdate = new Date();
          this.connectionStatus = 'connected';
          this.updateCounter++;

          // Update selected analysis if symbol matches
          if (this.selectedSymbol) {
            this.selectedAnalysis =
              data.find((d) => d.symbol === this.selectedSymbol) || null;
          }
          console.log('AnalysisComponent: selectedAnalysis sau khi cập nhật:', this.selectedAnalysis);

          // Force change detection for real-time updates
          this.cdr.detectChanges();
        },
                error: (error) => {
          console.error('Error subscribing to market data:', error); // Log the error
          this.connectionStatus = 'error';
          this.isLoading = false; // Set isLoading to false on error
          this.cdr.detectChanges();
        },
      })
    );
  }

  private startVisibilityCheck(): void {
    // Check every 5 seconds if data is being updated
    this.visibilityCheckInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - this.lastUpdate.getTime();
      if (timeSinceLastUpdate > 10000) {
        // More than 10 seconds
        this.connectionStatus = 'stale';
        this.cdr.detectChanges();
      }
    }, 5000);
  }

  selectSymbol(symbol: string): void {
    this.selectedSymbol = symbol;
    this.selectedAnalysis =
      this.marketData.find((d) => d.symbol === symbol) || null;
console.log('AnalysisComponent: selectedAnalysis sau khi chọn biểu tượng:', this.selectedAnalysis);
}

  getRecommendationClass(recommendation: string): string {
    switch (recommendation) {
      case 'BUY':
        return 'recommendation-buy';
      case 'SELL':
        return 'recommendation-sell';
      default:
        return 'recommendation-hold';
    }
  }

  getTrendClass(trend: string): string {
    switch (trend) {
      case 'BULLISH':
        return 'trend-bullish';
      case 'BEARISH':
        return 'trend-bearish';
      default:
        return 'trend-neutral';
    }
  }

  getChangeClass(change: number): string {
    return change >= 0 ? 'change-positive' : 'change-negative';
  }

  formatPrice(price: number): string {
    if (price === null || price === undefined) {
      return '0.00';
    }
    // Use toLocaleString with a specific locale to ensure consistent formatting
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatPercentage(value: number): string {
    if (value === null || value === undefined) {
      return '+0.00%';
    }
    const formattedValue = value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (value >= 0 ? '+' : '') + formattedValue + '%';
  }

  formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return (volume / 1000000).toFixed(1) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(1) + 'K';
    }
    return volume.toFixed(0);
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 80) return '#4CAF50';
    if (confidence >= 60) return '#FF9800';
    return '#F44336';
  }

  refreshData(): void {
    this.isLoading = true;
    this.connectionStatus = 'connecting';
    // Force the service to update immediately
    this.binanceApi.forceUpdate();
  }

  getConnectionStatusClass(): string {
    switch (this.connectionStatus) {
      case 'connected':
        return 'status-connected';
      case 'connecting':
        return 'status-connecting';
      case 'error':
        return 'status-error';
      case 'stale':
        return 'status-stale';
      default:
        return 'status-unknown';
    }
  }

  getConnectionStatusText(): string {
    switch (this.connectionStatus) {
      case 'connected':
        return 'Kết nối';
      case 'connecting':
        return 'Đang kết nối...';
      case 'error':
        return 'Lỗi kết nối';
      case 'stale':
        return 'Dữ liệu cũ';
      default:
        return 'Không xác định';
    }
  }
}
