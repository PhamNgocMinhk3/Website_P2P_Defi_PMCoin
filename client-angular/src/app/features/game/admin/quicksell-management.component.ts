import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Subject, takeUntil, timer } from 'rxjs';
import { FormsModule } from '@angular/forms'; // Import FormsModule
import { switchMap } from 'rxjs/operators';
import { NotificationService } from '../../../shared/services/notification.service';
import { NotificationComponent } from '../../../shared/components/notification/notification.component';

interface ContractBalances {
  [key: string]: number;
}

interface RateInfo {
  [key: string]: number;
}

interface QuickSellState {
  isLoading: boolean;
  balances: ContractBalances;
  updatingTokens: Set<string>;
  isDepositingVNDT: boolean;
  depositVNDTAmount: number | null;
  isWithdrawingTokens: Set<string>;
  rates: RateInfo;
}

@Component({
  selector: 'app-quicksell-management',
  standalone: true,
  imports: [CommonModule, HttpClientModule, NotificationComponent, DecimalPipe, FormsModule], // Add FormsModule here
  templateUrl: './quicksell-management.component.html',
  styleUrls: ['./quicksell-management.component.scss']
})
export class QuicksellManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  state: QuickSellState = {
    isLoading: true,
    balances: {},
    updatingTokens: new Set(),
    isDepositingVNDT: false,
    depositVNDTAmount: null,
    isWithdrawingTokens: new Set(),
    rates: {}
  };

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService
  ) {}
  
  ngOnInit(): void {
    // Fetch initial data, then set up a polling mechanism to refresh rates periodically.
    // This allows the admin to see the latest rates updated by the backend's background service.
    timer(0, 30000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.fetchRates();
    });
    this.fetchStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchStatus(): void {
    this.state.isLoading = true;
    this.http.get<any>('/api/admin/quicksell/status').subscribe({
      next: (res) => {
        if (res.success) {
          this.state.balances = res.data.balances;
        }
        this.state.isLoading = false;
      },
      error: (err) => {
        this.notificationService.show('Failed to load contract status.', 'error');
        this.state.isLoading = false;
      }
    });
  }

  fetchRates(): void {
    this.http.get<any>('/api/quicksell/rates').subscribe({
      next: (res) => {
        if (res.success) {
          // Initialize rates for all withdrawal tokens if not present
          this.getWithdrawalTokenSymbols().forEach(token => {
            if (!(token in res.data)) {
              res.data[token] = 0;
            }
          });
          this.state.rates = res.data;
        }
      }
    });
  }

  depositVNDT(): void {
    if (!this.state.depositVNDTAmount || this.state.depositVNDTAmount <= 0) {
      this.notificationService.show('Vui lòng nhập số tiền VNDT hợp lệ để nạp.', 'error');
      return;
    }

    this.state.isDepositingVNDT = true;
    this.notificationService.show(`Đang nạp ${this.state.depositVNDTAmount} VNDT vào contract...`, 'info');

    this.http.post<any>('/api/admin/quicksell/deposit-vndt', { amount: this.state.depositVNDTAmount }).subscribe({
      next: (res) => {
        if (res.success) {
          this.notificationService.show(`Nạp VNDT thành công! Tx: ${res.transactionHash.slice(0,10)}...`, 'success');
          this.state.depositVNDTAmount = null; // Clear input
          this.fetchStatus(); // Refresh balances
        } else {
          this.notificationService.show(res.message || 'Nạp VNDT thất bại.', 'error');
        }
      },
      error: (err) => {
        const errorMsg = err.error?.message || 'An unknown error occurred.';
        this.notificationService.show(`Lỗi khi nạp VNDT: ${errorMsg}`, 'error');
      },
      complete: () => {
        this.state.isDepositingVNDT = false;
      }
    });
  }

  withdrawTokens(tokenSymbol: string): void {
    if (this.state.isWithdrawingTokens.has(tokenSymbol)) return;

    this.state.isWithdrawingTokens.add(tokenSymbol);
    this.notificationService.show(`Đang rút tất cả ${tokenSymbol} từ contract...`, 'info');

    this.http.post<any>('/api/admin/quicksell/withdraw-tokens', { tokenSymbol }).subscribe({
      next: (res) => {
        if (res.success) {
          this.notificationService.show(`Rút ${tokenSymbol} thành công! Tx: ${res.transactionHash.slice(0,10)}...`, 'success');
          this.fetchStatus(); // Refresh balances
        } else {
          this.notificationService.show(res.message || `Rút ${tokenSymbol} thất bại.`, 'error');
        }
      },
      error: (err) => {
        const errorMsg = err.error?.message || 'An unknown error occurred.';
        this.notificationService.show(`Lỗi khi rút ${tokenSymbol}: ${errorMsg}`, 'error');
      },
      complete: () => {
        this.state.isWithdrawingTokens.delete(tokenSymbol);
      }
    });
  }

  // Helper to get supported tokens for withdrawal (excluding VNDT)
  getWithdrawalTokenSymbols(): string[] {
    // Filter out VNDT as it's for deposit, not withdrawal of collected tokens
    return this.getBalanceKeys().filter(token => token !== 'VNDT');
  }

  // Helper to get keys for the template
  getBalanceKeys(): string[] {
    return Object.keys(this.state.balances);
  }

  copyToClipboard(text: string | undefined): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.notificationService.show('Address copied to clipboard!', 'success');
    }).catch(err => {
      this.notificationService.show('Failed to copy address.', 'error');
      console.error('Could not copy text: ', err);
    });
  }
}
