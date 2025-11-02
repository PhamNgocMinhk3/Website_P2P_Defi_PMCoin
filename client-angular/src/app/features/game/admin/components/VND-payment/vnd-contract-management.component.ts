import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { SmartContractService, ContractStats } from '../../../../../core/services/smart-contract.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { AdminService, PaginatedResponse } from '../../../../../core/services/admin.service';

// FIX: Define the FiatTransaction interface here to include the missing property
export interface FiatTransaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  status: string;
  createdAt: Date; // FIX: Change type to Date to match the actual model
  // ADDED: Bank details for withdrawal display
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  transactionHash?: string; // Add the missing property
}

interface VndTreasuryStats {
  treasuryBalance: number;
  adminVndtBalance: number;
  allowance: number;
  depositAmount: string;
  isApproving: boolean;
  isDepositing: boolean;
}

@Component({
  selector: 'app-vnd-contract-management',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './vnd-contract-management.component.html',
  styleUrls: ['./vnd-contract-management.component.scss']
})
export class VndContractManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  stats: VndTreasuryStats = {
    treasuryBalance: 0,
    adminVndtBalance: 0,
    allowance: 0,
    depositAmount: '',
    isApproving: false,
    isDepositing: false,
  };

  transactions: FiatTransaction[] = [];
  currentPage: number = 1;
  pageSize: number = 10; // Default page size for UI
  totalPages: number = 1;
  totalTransactions: number = 0;
  // FIX: Initialize isLoading to false. It should only be true *during* an async operation.
  // The previous value `true` caused the initial data load to be skipped.
  isLoading = false;
  connectedAccount: string | null = null;

  // ADDED: For details modal
  selectedTransaction: FiatTransaction | null = null;

  constructor(
    private smartContractService: SmartContractService,
    private notificationService: NotificationService,
    private adminService: AdminService // Inject AdminService
  ) {}

  ngOnInit(): void {
    // FIX: Proactively try to connect the wallet when the component initializes.
    // The previous logic only loaded data if a wallet was already connected,
    // which is not the case when navigating directly to this page.
    this.smartContractService.connectWallet().catch(err => {
      // Silently fail if user cancels connection, but log for debugging.
      console.warn("User did not connect wallet or an error occurred.", err);
      this.notificationService.show("Vui lòng kết nối ví của admin để quản lý.", "warning");
    });

    this.smartContractService.connectedAccount
      .pipe(takeUntil(this.destroy$))
      .subscribe((account: string | null) => {
        this.connectedAccount = account;
        if (account) {
          this.loadAllData(); // This will now be triggered after successful connection.
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadAllData(): Promise<void> {
    if (this.isLoading) return; // Prevent multiple simultaneous loads
    this.isLoading = true;
    try {
      await Promise.all([
        this.loadContractStats(),
        this.loadTransactionLogs()
      ]);
    } catch (error: any) {
      this.notificationService.show(`Error loading data: ${error.message}`, 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async loadContractStats(): Promise<void> {
    if (!this.connectedAccount) return;
    console.log('[VND Management] 1. Loading contract stats...');
    try {
      const [treasuryBalance, adminVndtBalance, allowance] = await Promise.all([
        this.smartContractService.getVndtTreasuryBalance(),
        this.smartContractService.getVndtBalance(this.connectedAccount),
        this.smartContractService.getVndtAllowance(this.connectedAccount)
      ]);
      this.stats.treasuryBalance = parseFloat(treasuryBalance);
      this.stats.adminVndtBalance = parseFloat(adminVndtBalance);
      this.stats.allowance = parseFloat(allowance);
      console.log('[VND Management] 1a. Contract stats loaded:', this.stats);
    } catch (error: any) {
      this.notificationService.show(`Failed to load contract stats: ${error.message}`, 'error');
      console.error('[VND Management] Error loading contract stats:', error);
    }
  }

  async loadTransactionLogs(): Promise<void> {
    console.log('[VND Management] 2. Loading transaction logs...');
    try {
      // CRITICAL FIX: Convert the Observable to a Promise to work correctly with `await` in `loadAllData`.
      // Using .subscribe() inside an async function without awaiting it causes race conditions and hangs the loading state.
      const response = await firstValueFrom(this.adminService.getFiatTransactions(this.currentPage, this.pageSize));
      console.log('[VND Management] 2a. Transaction logs response received:', response);
      if (response) {
        this.transactions = response.data;
        this.totalTransactions = response.totalCount;
        this.totalPages = response.totalPages;
        this.currentPage = response.page;
      }
    } catch (error: any) {
      this.notificationService.show(`Failed to load transactions: ${error.message}`, 'error');
      console.error('[VND Management] Error loading transaction logs:', error);
    }
  }

  // FIX: Add the missing trackBy function for *ngFor optimization
  trackByTransactionId(index: number, tx: FiatTransaction): string {
    return tx.id;
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadTransactionLogs();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadTransactionLogs();
    }
  }

  get needsApproval(): boolean {
    const depositAmount = parseFloat(this.stats.depositAmount);
    return !isNaN(depositAmount) && depositAmount > 0 && depositAmount > this.stats.allowance;
  }

  async handleDeposit(): Promise<void> {
    if (this.needsApproval) {
      await this.approveAndDeposit();
    } else {
      await this.deposit();
    }
  }

  private async approveAndDeposit(): Promise<void> {
    const amount = this.stats.depositAmount;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      this.notificationService.show('Please enter a valid amount.', 'warning');
      return;
    }

    this.stats.isApproving = true;
    this.notificationService.show(`Requesting approval for ${amount} VNDT...`, 'info');
    try {
      const approveTx = await this.smartContractService.approveVndt(amount);
      this.notificationService.show(`Approval successful! Tx: ${approveTx.slice(0,10)}... Now depositing.`, 'success');
      
      // Automatically proceed to deposit after successful approval
      await this.deposit();

    } catch (error: any) {
      this.notificationService.show(`Approval failed: ${error.message}`, 'error');
    } finally {
      this.stats.isApproving = false;
    }
  }

  private async deposit(): Promise<void> {
    const amount = this.stats.depositAmount;
     if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      this.notificationService.show('Please enter a valid amount.', 'warning');
      return;
    }

    this.stats.isDepositing = true;
    this.notificationService.show(`Depositing ${amount} VNDT into treasury...`, 'info');
    try {
      const depositTx = await this.smartContractService.depositVndtToTreasury(amount);
      this.notificationService.show(`Deposit successful! Tx: ${depositTx.slice(0,10)}...`, 'success');
      this.stats.depositAmount = '';
      await this.loadContractStats(); // Refresh stats after deposit
    } catch (error: any) {
      this.notificationService.show(`Deposit failed: ${error.message}`, 'error');
    } finally {
      this.stats.isDepositing = false;
    }
  }

  // ADDED: Methods to handle withdrawal approval/rejection
  approveWithdrawal(transactionId: string): void {
    if (!confirm('Bạn có chắc chắn đã chuyển khoản cho người dùng và muốn PHÊ DUYỆT yêu cầu này? Hành động này không thể hoàn tác.')) return;
    
    this.isLoading = true;
    this.adminService.approveWithdrawal(transactionId).subscribe({
      next: (res) => {
        this.notificationService.show(res.message || 'Phê duyệt thành công!', 'success');
        this.loadTransactionLogs(); // Refresh the list
      },
      error: (err) => this.notificationService.show(err.error?.message || 'Phê duyệt thất bại.', 'error'),
      complete: () => this.isLoading = false
    });
  }

  rejectWithdrawal(transactionId: string): void {
    if (!confirm('Bạn có chắc chắn muốn TỪ CHỐI yêu cầu này và hoàn tiền VNDT cho người dùng?')) return;
    this.isLoading = true;
    this.adminService.rejectWithdrawal(transactionId).subscribe({
      next: (res) => {
        this.notificationService.show(res.message || 'Đã từ chối yêu cầu.', 'success');
        this.loadTransactionLogs(); // Refresh the list
      },
      error: (err) => this.notificationService.show(err.error?.message || 'Từ chối thất bại.', 'error'),
      complete: () => this.isLoading = false
    });
  }

  // ADDED: Methods to show/hide transaction details modal
  viewTransactionDetails(transaction: FiatTransaction): void {
    this.selectedTransaction = transaction;
  }

  closeTransactionDetails(): void {
    this.selectedTransaction = null;
  }
}
