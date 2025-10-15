import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationComponent } from '../../../shared/components/notification/notification.component';
import { Subject, takeUntil, interval, switchMap } from 'rxjs';
import { SmartContractService, ContractStats, UserBalance } from '../../../core/services/smart-contract.service';
import { NotificationService } from '../../../shared/services/notification.service';

// Interface with numbers for robust display
interface ContractStatsNumbers {
  gameMachineBalance: number;
  treasuryBalance: number;
  totalGameVolume: number;
  totalGameProfit: number;
  dailyProfitTarget: number;
  currentDailyProfit: number;
  isProfitTargetMet: boolean;
}

interface ServerStats {
  contractStats: ContractStatsNumbers | null;
  ownerBalance: UserBalance | null;
  isConnected: boolean;
  connectedAccount: string | null;
  isOwner: boolean;
  treasuryOperations: { depositAmount: string; withdrawAmount: string; isDepositing: boolean; isWithdrawing: boolean; };
  gameManagement: { dailyTarget: string; isSettingTarget: boolean; };
  payoutManagement: { emergencyPayoutAddress: string; emergencyPayoutAmount: string; isProcessingPayout: boolean; };
  recentTransactions: Array<{ hash: string; type: string; amount: string; timestamp: Date; status: 'pending' | 'success' | 'failed'; }>;
  accessDenied: boolean;
  isLoading: boolean;
}

@Component({
  selector: 'app-game-server-management',
  standalone: true,
  imports: [CommonModule, FormsModule, NotificationComponent, DecimalPipe],
  template: `
    <div class="server-management-container">
      <div class="management-header">
        <h1>🎮 Quản Lý Game Server</h1>
        <div class="connection-status" [class.connected]="serverStats.isConnected">
          <span class="status-indicator"></span>
          {{ serverStats.isConnected ? 'Đã Kết Nối' : 'Chưa Kết Nối' }}
          <span *ngIf="serverStats.connectedAccount" class="account">
            {{ serverStats.connectedAccount | slice:0:6 }}...{{ serverStats.connectedAccount | slice:-4 }}
          </span>
        </div>
      </div>

      <!-- Connect Wallet Section -->
      <div class="management-section" *ngIf="!serverStats.isConnected">
        <div class="connect-wallet-card">
          <h3>🔗 Kết Nối Ví</h3>
          <p>Kết nối ví MetaMask để quản lý game server</p>
          <button class="connect-btn" (click)="connectWallet()" [disabled]="serverStats.isLoading">{{ serverStats.isLoading ? 'Đang kết nối...' : 'Kết Nối MetaMask' }}</button>
        </div>
      </div>

      <!-- Owner Content -->
      <div *ngIf="serverStats.isConnected && serverStats.isOwner" class="owner-content">
        
        <!-- Stats Section -->
        <div class="management-section">
          <div class="section-header">
            <h3>📊 Thống Kê Contract</h3>
            <button class="refresh-btn" (click)="refreshData()" title="Làm mới dữ liệu">🔄 Làm mới</button>
          </div>
          <div class="stats-grid" *ngIf="serverStats.contractStats">
             <div class="stat-card">
              <div class="stat-label">Số Dư Máy Game</div>
              <div class="stat-value">{{ serverStats.contractStats.gameMachineBalance | number:'1.0-8' }} PM</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Số Dư Kho Bạc</div>
              <div class="stat-value">{{ serverStats.contractStats.treasuryBalance | number:'1.0-8' }} PM</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Tổng Khối Lượng Game</div>
              <div class="stat-value">{{ serverStats.contractStats.totalGameVolume | number:'1.0-8' }} PM</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Tổng Lợi Nhuận Game</div>
              <div class="stat-value">{{ serverStats.contractStats.totalGameProfit | number:'1.0-8' }} PM</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Mục Tiêu Lợi Nhuận Hàng Ngày</div>
              <div class="stat-value">{{ serverStats.contractStats.dailyProfitTarget | number:'1.0-8' }} PM</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Lợi Nhuận Hàng Ngày Hiện Tại</div>
              <div class="stat-value">{{ serverStats.contractStats.currentDailyProfit | number:'1.0-8' }} PM</div>
            </div>
            <div class="stat-card" [class.target-met]="serverStats.contractStats.isProfitTargetMet">
              <div class="stat-label">Trạng Thái Mục Tiêu</div>
              <div class="stat-value">{{ serverStats.contractStats.isProfitTargetMet ? '✅ Đạt' : '❌ Chưa Đạt' }}</div>
            </div>
          </div>
        </div>

        <!-- Treasury Management -->
        <div class="management-section">
          <div class="section-header">
            <h3>💰 Quản lý Kho bạc</h3>
          </div>
          <div class="treasury-controls">
            <div class="control-group">
              <label for="depositAmount">Nạp tiền vào Kho bạc</label>
              <div class="input-group">
                <input id="depositAmount" type="text" [(ngModel)]="serverStats.treasuryOperations.depositAmount" placeholder="Số lượng PM">
                <button class="action-btn deposit" (click)="depositToTreasury()" [disabled]="serverStats.treasuryOperations.isDepositing">
                  {{ serverStats.treasuryOperations.isDepositing ? 'Đang nạp...' : 'Nạp tiền' }}
                </button>
              </div>
              <small>Nạp token PM đã được approve vào kho bạc của contract.</small>
            </div>
            <div class="control-group">
              <label for="withdrawAmount">Rút tiền từ Kho bạc</label>
              <div class="input-group">
                <input id="withdrawAmount" type="text" [(ngModel)]="serverStats.treasuryOperations.withdrawAmount" placeholder="Số lượng PM">
                <button class="action-btn withdraw" (click)="withdrawFromTreasury()" [disabled]="serverStats.treasuryOperations.isWithdrawing">
                  {{ serverStats.treasuryOperations.isWithdrawing ? 'Đang rút...' : 'Rút tiền' }}
                </button>
              </div>
              <small>Rút token PM từ kho bạc về ví admin của bạn.</small>
            </div>
          </div>
        </div>

        <!-- Game Management -->
        <div class="management-section">
          <div class="section-header">
            <h3>⚙️ Quản lý Game</h3>
          </div>
          <div class="game-controls">
            <div class="control-group">
              <label for="dailyTarget">Đặt mục tiêu lợi nhuận hàng ngày</label>
              <div class="input-group">
                <input id="dailyTarget" type="text" [(ngModel)]="serverStats.gameManagement.dailyTarget" placeholder="Số lượng PM">
                <button class="action-btn target" (click)="setDailyProfitTarget()" [disabled]="serverStats.gameManagement.isSettingTarget">
                  {{ serverStats.gameManagement.isSettingTarget ? 'Đang đặt...' : 'Đặt mục tiêu' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Emergency Payout -->
        <div class="management-section">
           <div class="section-header">
            <h3>🚨 Thanh Toán Khẩn Cấp</h3>
          </div>
          <div class="game-controls">
              <div class="control-group emergency">
                  <label for="emergencyAddress">Gửi tiền khẩn cấp</label>
                  <div class="input-group">
                      <input id="emergencyAddress" type="text" [(ngModel)]="serverStats.payoutManagement.emergencyPayoutAddress" placeholder="Địa chỉ ví người nhận">
                  </div>
                  <div class="input-group">
                      <input id="emergencyAmount" type="text" [(ngModel)]="serverStats.payoutManagement.emergencyPayoutAmount" placeholder="Số lượng PM" (keydown.enter)="processManualWithdrawal()">
                      <button class="action-btn emergency" (click)="processManualWithdrawal()" [disabled]="serverStats.payoutManagement.isProcessingPayout">
                          {{ serverStats.payoutManagement.isProcessingPayout ? 'Đang gửi...' : 'Gửi khẩn cấp' }}
                      </button>
                  </div>
                  <small class="warning">Chức năng này sẽ gửi token trực tiếp từ kho bạc. Chỉ sử dụng khi thực sự cần thiết.</small>
              </div>
          </div>
        </div>

      </div>

      <!-- Access Denied Message -->
      <div *ngIf="serverStats.isConnected && !serverStats.isOwner" class="non-owner-message">
        <div class="access-denied-card">
          <h3>🚫 Truy Cập Bị Từ Chối</h3>
          <p>Bạn không phải là chủ sở hữu contract. Chỉ chủ sở hữu contract mới có thể quản lý game server.</p>
          <p>Đã kết nối với: {{ serverStats.connectedAccount }}</p>
        </div>
      </div>
    </div>
    <app-notification></app-notification>
  `,
  styleUrls: ['./game-server-management.component.scss']
})
export class GameServerManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  serverStats: ServerStats = {
    contractStats: null,
    ownerBalance: null,
    isConnected: false,
    connectedAccount: null,
    isOwner: false,
    treasuryOperations: { depositAmount: '', withdrawAmount: '', isDepositing: false, isWithdrawing: false },
    gameManagement: { dailyTarget: '', isSettingTarget: false },
    payoutManagement: { emergencyPayoutAddress: '', emergencyPayoutAmount: '', isProcessingPayout: false },
    recentTransactions: [],
    accessDenied: false, 
    isLoading: false,
  };

  constructor(
    private smartContractService: SmartContractService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.initializeComponent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeComponent(): void {
    this.smartContractService.connectedAccount
      .pipe(takeUntil(this.destroy$))
      .subscribe(account => {
        this.serverStats.isConnected = !!account;
        this.serverStats.connectedAccount = account;
        if (account) {
          this.loadContractData(); // Load data when account is available
          this.startDataRefresh();
        }
      });

    this.smartContractService.isOwner
      .pipe(takeUntil(this.destroy$))
      .subscribe(isOwner => {
        this.serverStats.isOwner = isOwner;
      });
  }

  async connectWallet(): Promise<void> {
    this.serverStats.isLoading = true;
    this.notificationService.show('Requesting wallet connection...', 'info');
    try {
      await this.smartContractService.connectWallet();
      this.notificationService.show('Wallet connected successfully!', 'success');
    } catch (error: any) {
      this.notificationService.show(`Connection failed: ${error.message}`, 'error');
    } finally {
      this.serverStats.isLoading = false;
    }
  }

  private parseStats(stats: ContractStats | null): ContractStatsNumbers | null {
    if (!stats) return null;
    
    // Safely parse stats, providing default value of 0 if a property is missing.
    return {
      gameMachineBalance: parseFloat(String(stats.gameMachineBalance || '0').replace(',', '.')) || 0,
      treasuryBalance: parseFloat(String(stats.treasuryBalance || '0').replace(',', '.')) || 0,
      totalGameVolume: parseFloat(String(stats.totalGameVolume || '0').replace(',', '.')) || 0,
      totalGameProfit: parseFloat(String(stats.totalGameProfit || '0').replace(',', '.')) || 0,
      dailyProfitTarget: parseFloat(String(stats.dailyProfitTarget || '0').replace(',', '.')) || 0,
      currentDailyProfit: parseFloat(String(stats.currentDailyProfit || '0').replace(',', '.')) || 0,
      isProfitTargetMet: stats.isProfitTargetMet || false
    };
  }

  private async loadContractData(): Promise<void> {
    try {
      const stats = await this.smartContractService.getContractStats();
      this.serverStats.contractStats = this.parseStats(stats);
    } catch (error) {
      console.error('❌ Failed to fetch contract stats from backend', error);
      this.notificationService.show('Failed to load contract data from server.', 'error');
    }
  }

  private startDataRefresh(): void {
    interval(15000) // Refresh every 15 seconds
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.loadContractData())
      )
      .subscribe();
  }

  async refreshData(): Promise<void> {
    this.notificationService.show('🔄 Refreshing data from the blockchain...', 'info');
    await this.loadContractData();
    this.notificationService.show('✅ Data has been refreshed.', 'success');
  }

  // --- Admin Actions ---

  async depositToTreasury(): Promise<void> {
    const { depositAmount } = this.serverStats.treasuryOperations;
    if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
      this.notificationService.show('Please enter a valid amount to deposit.', 'warning');
      return;
    }

    this.serverStats.treasuryOperations.isDepositing = true;
    this.notificationService.show('Processing treasury deposit...', 'info');
    try {
      const txHash = await this.smartContractService.depositToTreasury(depositAmount);
      this.notificationService.show(`Deposit successful! Tx: ${txHash.slice(0, 10)}...`, 'success');
      this.serverStats.treasuryOperations.depositAmount = ''; // Clear input
      await this.refreshData();
    } catch (error: any) {
      this.notificationService.show(`Deposit failed: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      this.serverStats.treasuryOperations.isDepositing = false;
    }
  }

  async withdrawFromTreasury(): Promise<void> {
    const { withdrawAmount } = this.serverStats.treasuryOperations;
    if (!withdrawAmount || isNaN(Number(withdrawAmount)) || Number(withdrawAmount) <= 0) {
      this.notificationService.show('Please enter a valid amount to withdraw.', 'warning');
      return;
    }

    this.serverStats.treasuryOperations.isWithdrawing = true;
    this.notificationService.show('Processing treasury withdrawal...', 'info');
    try {
      const txHash = await this.smartContractService.withdrawFromTreasury(withdrawAmount);
      this.notificationService.show(`Withdrawal successful! Tx: ${txHash.slice(0, 10)}...`, 'success');
      this.serverStats.treasuryOperations.withdrawAmount = ''; // Clear input
      await this.refreshData();
    } catch (error: any) {
      this.notificationService.show(`Withdrawal failed: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      this.serverStats.treasuryOperations.isWithdrawing = false;
    }
  }

  async setDailyProfitTarget(): Promise<void> {
    const { dailyTarget } = this.serverStats.gameManagement;
    if (!dailyTarget || isNaN(Number(dailyTarget)) || Number(dailyTarget) < 0) {
      this.notificationService.show('Please enter a valid profit target.', 'warning');
      return;
    }

    this.serverStats.gameManagement.isSettingTarget = true;
    this.notificationService.show('Setting daily profit target...', 'info');
    try {
      const txHash = await this.smartContractService.setDailyProfitTarget(dailyTarget);
      this.notificationService.show(`Profit target set! Tx: ${txHash.slice(0, 10)}...`, 'success');
      this.serverStats.gameManagement.dailyTarget = ''; // Clear input
      await this.refreshData();
    } catch (error: any) {
      this.notificationService.show(`Failed to set target: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      this.serverStats.gameManagement.isSettingTarget = false;
    }
  }

  async processManualWithdrawal(): Promise<void> {
    const { emergencyPayoutAddress, emergencyPayoutAmount } = this.serverStats.payoutManagement;
    if (!emergencyPayoutAddress || !emergencyPayoutAmount || isNaN(Number(emergencyPayoutAmount)) || Number(emergencyPayoutAmount) <= 0) {
      this.notificationService.show('Please enter a valid recipient address and amount.', 'warning');
      return;
    }

    // This function now correctly calls the new `emergencyPayout` method for sending to a specific address.
    this.serverStats.payoutManagement.isProcessingPayout = true;
    this.notificationService.show('Processing emergency payout...', 'info');
    try {
      const txHash = await this.smartContractService.emergencyPayout(emergencyPayoutAmount, emergencyPayoutAddress);
      this.notificationService.show(`Emergency payout successful! Tx: ${txHash.slice(0, 10)}...`, 'success');
      this.serverStats.payoutManagement.emergencyPayoutAddress = '';
      this.serverStats.payoutManagement.emergencyPayoutAmount = '';
      await this.refreshData();
    } catch (error: any) {
      this.notificationService.show(`Payout failed: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      this.serverStats.payoutManagement.isProcessingPayout = false;
    }
  }
}
