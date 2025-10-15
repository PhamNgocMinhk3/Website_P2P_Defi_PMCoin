import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { GameService, CurrentGameSession, ProfitAnalysis, ActiveBet, BotTransaction, DailyTarget } from '../services/game.service';
import { SmartContractService, ContractStats } from '../../../core/services/smart-contract.service';
import { Subscription, interval } from 'rxjs';

interface BotActivity {
  isActive: boolean;
  activeBots: number;
  totalBots: number;
  lastAction: string;
  nextCycle: number;
  manipulationMode: string;
  priceManipulation: string;
}
interface UserStats {
  address: string;
  consecutiveWins: number;
  consecutiveLoses: number;
  status: string;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
}
@Component({
  selector: 'app-manager-game-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manager-game-hub.component.html',
  styleUrls: ['./manager-game-hub.component.scss']
})
export class ManagerGameHubComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];
  private updateInterval = 5000; // 5 seconds

  // Real-time data from backend
  currentSession: CurrentGameSession | null = null;
  profitAnalysis: ProfitAnalysis | null = null;
  activeBets: ActiveBet[] = [];
  botTransactions: BotTransaction[] = [];
  dailyTarget: DailyTarget | null = null;

  // Bot transactions realtime update
  private botTransactionInterval?: Subscription;

  // Smart Contract data
  contractStats: ContractStats | null = null;
  botActivity: BotActivity = {
    isActive: true,
    activeBots: 10,
    totalBots: 100,
    lastAction: 'Bot #47 SELL 2.3M PM → $11.16',
    nextCycle: 2,
    manipulationMode: 'Target Mode',
    priceManipulation: 'Need +$244'
  };
  // User Management - Real data from backend
  blacklistedUsers: UserStats[] = [];
  whitelistedUsers: UserStats[] = [];

  // Admin state
  currentUser: any;
  isGamePaused = false;
  autoControlsEnabled = {
    autoPauseHighExposure: true,
    reduceMaxBetLowBalance: true,
    alertLargeBets: true,
    emergencyStopPriceMovements: true
  };

  // Alert system
  alerts = [
    { type: 'danger', message: 'High exposure on BTC (>50%)', timestamp: new Date() },
    { type: 'warning', message: 'Large bet detected: 5,000 PM on ETH UP', timestamp: new Date() },
    { type: 'success', message: 'House balance healthy: 2.3M PM', timestamp: new Date() }
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
    public gameService: GameService,
    private smartContractService: SmartContractService
  ) {}

  ngOnInit(): void {
    // Check admin access
    if (!this.authService.isAuthenticated || !this.authService.isAdmin()) {
      this.router.navigate(['/']);
      return;
    }

    this.currentUser = this.authService.currentUser;

    // Start real-time updates
    this.startRealTimeUpdates();
    this.startBotTransactionUpdates();
    this.loadContractStats();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.botTransactionInterval) {
      this.botTransactionInterval.unsubscribe();
    }
  }

  private startRealTimeUpdates(): void {
    // Update bot cycle countdown
    const botCycleSub = interval(1000).subscribe(() => {
      if (this.botActivity.nextCycle > 0) {
        this.botActivity.nextCycle--;
      } else {
        this.botActivity.nextCycle = 4; // Reset to 4 seconds
      }
    });
    this.subscriptions.push(botCycleSub);

    // Update blacklist/whitelist users periodically
    const userStatsSub = interval(5000).subscribe(() => {
      this.updateUserStats();
      this.loadContractStats();
    });
    this.subscriptions.push(userStatsSub);
  }

  private startBotTransactionUpdates(): void {
    // Subscribe to real-time bot transactions from GameService
    const botTransactionsSub = this.gameService.botTransactions$.subscribe(
      (transactions: BotTransaction[]) => {
        this.botTransactions = transactions.slice(0, 6); // Keep only latest 6
      }
    );
    this.subscriptions.push(botTransactionsSub);
  }

  private async loadContractStats(): Promise<void> {
    try {
      this.contractStats = await this.smartContractService.getContractStats();
    } catch (error) {
      console.error('Error loading contract stats:', error);
      this.contractStats = null;
    }
  }

  private async updateUserStats(): Promise<void> {
    try {
      // Get blacklisted users from backend
      const blacklistedResponse = await this.gameService.getBlacklistedUsers();
      this.blacklistedUsers = blacklistedResponse || [];

      // Get whitelisted users from backend
      const whitelistedResponse = await this.gameService.getWhitelistedUsers();
      this.whitelistedUsers = whitelistedResponse || [];
    } catch (error) {
      console.error('Error loading user stats:', error);
      // Keep empty arrays if error
      this.blacklistedUsers = [];
      this.whitelistedUsers = [];
    }
  }

  getProgressBarWidth(): string {
    if (!this.dailyTarget) return '0%';
    return `${Math.min(this.dailyTarget.progressPercentage, 100)}%`;
  }

  getProgressBarColor(): string {
    if (!this.dailyTarget) return '#2563eb';
    if (this.dailyTarget.progressPercentage >= 100) return '#059669'; // Green
    if (this.dailyTarget.progressPercentage >= 80) return '#d97706'; // Orange
    return '#2563eb'; // Blue
  }

  getRemainingTarget(): number {
    if (!this.dailyTarget) return 0;
    return Math.max(0, this.dailyTarget.targetAmount - this.dailyTarget.achievedAmount);
  }

  formatCurrency(amount: number): string {
    return this.gameService.formatCurrency(amount);
  }

  formatAddress(address: string): string {
    return this.gameService.formatAddress(address);
  }

  formatAmount(amount: number): string {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + 'K';
    }
    return amount.toString();
  }

  

  // Refresh all data
  refreshData(): void {
    // console.log('Data refresh triggered'); // Tắt log
  }

  // Reset daily target (placeholder)
  resetDailyTarget(): void {
    // console.log('Reset daily target triggered'); // Tắt log
  }

  // Export report (placeholder)
  exportReport(): void {
    // console.log('Export report triggered'); // Tắt log
  }

  // ===== NEW ADMIN METHODS BASED ON GAME.MD =====

  // Game Control Methods
  pauseAllGames(): void {
    this.isGamePaused = true;
    console.log('🛑 All games paused');
    // Call backend API to pause games
  }

  resumeGames(): void {
    this.isGamePaused = false;
    console.log('▶️ Games resumed');
    // Call backend API to resume games
  }

  emergencyWithdraw(): void {
    console.log('🚨 Emergency withdrawal initiated');
    // Call backend API for emergency withdrawal
  }

  freezeContract(): void {
    console.log('❄️ Contract frozen');
    // Call backend API to freeze smart contract
  }



  // User Management
  removeFromBlacklist(address: string): void {
    this.blacklistedUsers = this.blacklistedUsers.filter(user => user.address !== address);
    console.log('✅ Removed from blacklist:', address);
    // Call backend API to remove from blacklist
  }

  removeFromWhitelist(address: string): void {
    this.whitelistedUsers = this.whitelistedUsers.filter(user => user.address !== address);
    console.log('✅ Removed from whitelist:', address);
    // Call backend API to remove from whitelist
  }



  // Alert Management
  dismissAlert(index: number): void {
    this.alerts.splice(index, 1);
  }

  getAlertIcon(type: string): string {
    switch (type) {
      case 'danger': return '🔴';
      case 'warning': return '🟡';
      case 'success': return '🟢';
      default: return 'ℹ️';
    }
  }

  // Utility Methods
  trackByBetId(_index: number, bet: ActiveBet): string {
    return bet.betId;
  }

  trackByTxId(_index: number, tx: BotTransaction): string {
    return tx.botAddress + tx.timestamp;
  }

  trackByTransactionId(_index: number, transaction: BotTransaction): string {
    return transaction.botAddress + transaction.timestamp;
  }

  formatBotAddress(address: string): string {
    return address; // Already formatted as Bot#XX
  }

  getTimeAgo(timestamp: string): string {
    const now = new Date();
    const timestampDate = new Date(timestamp);
    const diff = Math.floor((now.getTime() - timestampDate.getTime()) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
  }

  trackByAddress(_index: number, user: UserStats): string {
    return user.address;
  }

  // Target Management
  getTargetStatusColor(): string {
    if (!this.dailyTarget) return '#6b7280';
    if (this.dailyTarget.isTargetAchieved) return '#059669';
    if (this.dailyTarget.progressPercentage >= 80) return '#d97706';
    return '#2563eb';
  }

  getTargetStatusText(): string {
    if (!this.dailyTarget) return 'No Target';
    if (this.dailyTarget.isTargetAchieved) return '✅ Achieved';
    if (this.dailyTarget.progressPercentage >= 80) return '🟡 On Track';
    return '🔵 In Progress';
  }

  // Bot Management
  getBotStatusColor(): string {
    return this.botActivity.isActive ? '#059669' : '#dc2626';
  }

  getBotStatusIcon(): string {
    return this.botActivity.isActive ? '🟢' : '🔴';
  }

  // Smart Contract Methods
  openContractManagement(): void {
    // Navigate to smart contract management page
    this.router.navigate(['/game/admin/contract-management']);
  }

  // System Logs Method
  openSystemLogs(): void {
    this.router.navigate(['/game/admin/logs']);
  }



  // Logout
  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (error) => {
        console.error('Logout error:', error);
        this.router.navigate(['/']);
      }
    });
  }
}
