import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, filter, switchMap, map } from 'rxjs';
import { SmartContractService } from '../../../core/services/smart-contract.service';
import { GameService } from './game.service';
import { MetaMaskService, WalletInfo } from '../../../services/metamask.service';
import { NotificationService } from '../../../shared/services/notification.service';

export interface BetRequest {
  amount: string; 
  direction: 'up' | 'down';
  userAddress: string;
}

export interface BetResult {
  success: boolean;
  transactionHash?: string;
  betId?: number;
  // FIX: Add sessionId to the result interface to carry it from the backend to the component.
  sessionId?: string;
  error?: string;
}

export interface UserBalance {
  // The concept of a separate game balance is removed to match the new smart contract.
  // We only care about the user's main wallet balance now.
  gameBalance: string;
}

export interface BetMarker {
  betId?: string;
  amount: string;
  direction: 'up' | 'down';
  startPrice: number;
  startTime: Date;
  endTime?: Date;
  endPrice?: number;
  result?: 'WIN' | 'LOSE' | 'DRAW' | 'PENDING';
  payout?: string;
  transactionHash?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BettingService {
  private userBalanceSubject = new BehaviorSubject<UserBalance>({ gameBalance: '0' });
  private isBettingSubject = new BehaviorSubject<boolean>(false);
  private lastBetSubject = new BehaviorSubject<BetMarker | null>(null);
  private currentBetMarkerSubject = new BehaviorSubject<BetMarker | null>(null);

  public userBalance$ = this.userBalanceSubject.asObservable();
  public isBetting$ = this.isBettingSubject.asObservable();
  public lastBet$ = this.lastBetSubject.asObservable();
  public currentBetMarker$ = this.currentBetMarkerSubject.asObservable();

  constructor(
    private smartContractService: SmartContractService,
    private gameService: GameService,
    private metaMaskService: MetaMaskService,
    private notificationService: NotificationService
  ) {
    this.initializeService();
  }

  private initializeService(): void {
    // Subscribe to wallet connection changes
    // FIX: Chain subscriptions to prevent race conditions.
    // Only update balances AFTER the smart contract service is fully initialized.
    this.metaMaskService.walletInfo$
      .pipe(
        filter((walletInfo): walletInfo is WalletInfo => !!walletInfo), // Only proceed if walletInfo is not null
        switchMap(walletInfo => 
          this.smartContractService.isInitialized$.pipe(filter(isInitialized => isInitialized), map(() => walletInfo))
        )
      )
      .subscribe(walletInfo => this.updateUserBalances(walletInfo.address));
  }

  /**
   * Get user balances (wallet and game internal balance)
   */
  async updateUserBalances(userAddress: string): Promise<void> {
    try {
      // With the new contract, there's no "internal balance". We only need the user's wallet balance.
      const walletBalance = await this.smartContractService.getPMTokenBalance(userAddress);

      this.userBalanceSubject.next({
        gameBalance: walletBalance.toString() // Use gameBalance to represent the total available balance for betting.
      });
    } catch (error) {
      console.error('Failed to update user balances:', error);
      this.userBalanceSubject.next({
        gameBalance: '0'
      });
    }
  }

  /**
   * Place a bet in the game.
   * The new logic is much simpler:
   * 1. Check user's wallet balance.
   * 2. Approve the contract to spend the tokens.
   * 3. Call `placeBet` on the contract, which will pull the tokens.
   */
  async placeBet(betRequest: BetRequest): Promise<BetResult> {
    if (this.isBettingSubject.value) {
      return { success: false, error: 'Bet already in progress' };
    }
    this.isBettingSubject.next(true);

    try {
      const betAmount = parseFloat(betRequest.amount);
      const currentBalance = this.userBalanceSubject.value;
      const walletBalance = parseFloat(currentBalance.gameBalance); // We now use gameBalance as the main wallet balance

      // Step 1: Check if user has sufficient balance in their wallet.
      if (walletBalance < betAmount) {
        this.notificationService.show(`Không đủ PM token. Cần ${betAmount} PM, trong ví có ${walletBalance} PM`, 'error');
        throw new Error(`Insufficient wallet balance. Need ${betAmount} PM, have ${walletBalance} PM`);
      }

      // Step 2: Approve the contract to spend the required amount.
      this.notificationService.show(`🔐 Đang yêu cầu quyền sử dụng ${betAmount} PM...`, 'info');
      await this.smartContractService.approvePMTokens(betRequest.amount);
      this.notificationService.show('✅ Phê duyệt thành công!', 'success');

      this.notificationService.show('🎲 Đang đặt cược...', 'info');

      // Create bet marker for tracking
      const betMarker: BetMarker = {
        amount: betRequest.amount,
        direction: betRequest.direction,
        startPrice: 0, // Will be updated by game component
        startTime: new Date(),
        result: 'PENDING'
      };

      // Step 3: Place the bet on the smart contract. The contract will now pull the tokens.
      const { transactionHash, betId } = await this.smartContractService.placeBet(
        betRequest.amount,
        betRequest.direction === 'up'
      );

      // Update bet marker with transaction hash
      betMarker.transactionHash = transactionHash;
      this.currentBetMarkerSubject.next(betMarker);
      console.log('DEBUG: currentBetMarkerSubject emitted:', betMarker);

      // ❌ REMOVED: Auto clear timeout - let GameComponent handle clearing properly
      // Log bet to backend for tracking
      const backendResult = await this.logBetToBackend(betRequest, transactionHash, betId);

      this.notificationService.show('✅ Đặt cược thành công!', 'success');

      // Update balances
      await this.updateUserBalances(betRequest.userAddress);

      // Store last bet info
      this.lastBetSubject.next(betMarker);

      return {
        success: true,
        transactionHash: transactionHash,
        sessionId: backendResult.sessionId, // Pass the sessionId from the backend response
      };

    } catch (error: any) {
      this.notificationService.show(`❌ Đặt cược thất bại: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isBettingSubject.next(false);
    }
  }

  /**
   * Log bet to backend for game tracking
   */
  private async logBetToBackend(betRequest: BetRequest, txHash: string, contractBetId: number): Promise<any> {
    try {
      const logData = {
        userAddress: betRequest.userAddress,
        direction: betRequest.direction.toUpperCase(),
        amount: parseFloat(betRequest.amount),
        // GỬI KÈM CONTRACT BET ID VỀ BACKEND
        contractBetId: contractBetId
      };

      // Call backend API to log the bet
      const response = await firstValueFrom(this.gameService.placeBet(logData));
      return response;
    } catch (error: any) {
      // Only log backend connection errors once to avoid spam
      if (error.status === 0) {
        console.warn('Backend unavailable - bet logged locally only');
      } else {
        console.error('Failed to log bet to backend:', error);
      }
      // Throw the error so the calling function can handle it
      throw error;
    }
  }

  /**
   * Check if user can place bet (checks total balance: wallet + game)
   */
  canPlaceBet(amount: string): boolean {
    const currentBalance = this.userBalanceSubject.value;
    const betAmount = parseFloat(amount);
    const walletBalance = parseFloat(currentBalance.gameBalance); // Using gameBalance as the main wallet balance
    return walletBalance >= betAmount && !this.isBettingSubject.value;
  }

  /**
   * Get current user balances
   */
  getCurrentBalances(): UserBalance {
    return this.userBalanceSubject.value;
  }

  /**
   * Format amount for display
   */
  formatAmount(amount: string | number): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  }

  /**
   * Convert amount to wei string for smart contract
   */
  toWeiString(amount: string): string {
    // PM token has 6 decimals
    const num = parseFloat(amount);
    const wei = Math.floor(num * 1000000); // 10^6
    return wei.toString();
  }

  /**
   * Convert wei string to readable amount
   */
  fromWeiString(weiAmount: string): string {
    const wei = parseInt(weiAmount);
    const amount = wei / 1000000; // 10^6
    return amount.toString();
  }

  /**
   * Update current bet marker with start price
   */
  updateBetMarkerStartPrice(price: number): void {
    const currentMarker = this.currentBetMarkerSubject.value;
    if (currentMarker) {
      currentMarker.startPrice = price;
      this.currentBetMarkerSubject.next(currentMarker);
    }
  }

  /**
   * Resolve current bet with end price and result
   */
  resolveBetMarker(endPrice: number, result: 'WIN' | 'LOSE' | 'DRAW', payout?: string): void {
    const currentMarker = this.currentBetMarkerSubject.value;
    if (currentMarker) {
      currentMarker.endPrice = endPrice;
      currentMarker.endTime = new Date();
      currentMarker.result = result;
      currentMarker.payout = payout;

      // Move to last bet and clear current
      this.lastBetSubject.next(currentMarker);
      this.currentBetMarkerSubject.next(null);
    }
  }

  /**
   * Get current bet marker for display
   */
  getCurrentBetMarker(): BetMarker | null {
    return this.currentBetMarkerSubject.value;
  }

  /**
   * Clear current bet marker
   */
  clearCurrentBetMarker(): void {
    this.currentBetMarkerSubject.next(null);
  }

  /**
   * Clear bet marker (alias for clearCurrentBetMarker)
   */
  clearBetMarker(): void {
    this.clearCurrentBetMarker();
    console.log('🔄 Bet marker cleared');
  }

  /**
   * Get bet comparison data for user reference
   */
  getBetComparisonData(): {
    hasBet: boolean;
    direction: 'up' | 'down' | null;
    amount: string;
    startPrice: number;
    currentPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    timeElapsed?: number;
    isWinning?: boolean;
  } {
    const marker = this.currentBetMarkerSubject.value;

    if (!marker) {
      return {
        hasBet: false,
        direction: null,
        amount: '0',
        startPrice: 0
      };
    }

    return {
      hasBet: true,
      direction: marker.direction,
      amount: marker.amount,
      startPrice: marker.startPrice,
      timeElapsed: marker.startTime ? Date.now() - marker.startTime.getTime() : 0
    };
  }
}
