import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  Inject,
  PLATFORM_ID,
  ChangeDetectorRef,
  NgZone
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { PMCoinData, SimulatedTransaction } from '../../core/services/price-simulation.service';
import { GameService, BotTransaction, CurrentGameSession, GameSessionStatus, ProfitAnalysis, ActiveBet, DailyTarget } from './services/game.service';
import { BettingService, BetMarker } from './services/betting.service';
import { take } from 'rxjs/operators';
import { GameHubService } from '../../services/game-hub.service'; // NEW: Import GameHubService
import { MetaMaskService } from '../../services/metamask.service';
import { NotificationService } from '../../shared/services/notification.service';
import { NotificationComponent } from '../../shared/components/notification/notification.component';
import { Subscription } from 'rxjs';
import { gsap } from 'gsap';
import { TradingViewChartService, TradingViewCandleData } from './services/tradingview-chart.service';
import { Time } from 'lightweight-charts';
// Import SmartContractService to access contract stats
import { SmartContractService } from '../../core/services/smart-contract.service';

interface PricePoint {
  time: number;  // Unix timestamp
  value: number; // Price value
}

interface GameRound {
  id: number;
  startPrice: number;
  endPrice: number;
  prediction: 'UP' | 'DOWN' | null;
  result: 'WIN' | 'LOSE' | 'PENDING';
  profit: number;
  timestamp: Date;
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss'],
})
export class GameComponent implements OnInit, OnDestroy, AfterViewInit {
  public currentSession: CurrentGameSession | null = null;
  @ViewChild('priceChart', { static: false })
  chartContainerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('timerValue', { static: true }) timerValueRef!: ElementRef<HTMLSpanElement>;

  public uiState: 'BETTING' | 'SHOWING_RESULT' = 'BETTING';
  private nextSession: CurrentGameSession | null = null;

  // Game state
  balance = 10000;
  userBalance = 10000;
  betAmount = 100;
  currentBet: any = null;
  lastSessionId: string | null = null;
  currentRound = 1;
  currentPrice = 100; // Current PM Coin price
  pmCoinData: PMCoinData | null = null;
  recentTransactions: SimulatedTransaction[] = [];
  botTransactions: BotTransaction[] = []; // Keep for price manipulation

  // Quick bet amounts
  quickAmounts = [10, 25, 50, 100, 250, 500];

  // Game state management
  gameState = {
    timeLeft: 60,
    isActive: false,
    canBet: true,
  };

  // Game statistics
  gameStats = {
    winRate: 65.23,
    totalProfit: 1250.5,
    gamesPlayed: 47,
    currentStreak: 3,
  };
  
  // Contract stats
  public contractBalance: string = 'Loading...';

  // Game rounds
  gameHistory: GameRound[] = [];
  roundCounter = 1;
  autoTradingEnabled = false;

  // LINE CHART - Simple and clean for UP/DOWN game
  private priceData: PricePoint[] = [];

  // Subscriptions
  private subscriptions: Subscription[] = [];
  private gameTimer: any;
  private sessionEndTime: number = 0;
  private timerLoopId: any;
  private lastSessionStatus: string | null = null;
  private lastResultShown = false;

  constructor(
    private gameService: GameService,
    public bettingService: BettingService, // Make public for template access
    // private signalRService: SignalRService, // REMOVED
    private metaMaskService: MetaMaskService,
    private notificationService: NotificationService,
    private tradingViewChartService: TradingViewChartService,
    private smartContractService: SmartContractService, // Injected service
    private cdr: ChangeDetectorRef ,
    private ngZone: NgZone ,
    @Inject(PLATFORM_ID) private platformId: Object,
    private gameHubService: GameHubService // NEW: Inject GameHubService
  ) {}

  ngOnInit(): void {
    console.log('DEBUG: GameComponent ngOnInit called.');
    this.initializeGame();
    this.subscribeToDataStreams(); // Consolidated subscription logic
    this.refreshContractBalance(); // Initial load
  }

  private subscribeToDataStreams(): void {
    // --- REAL-TIME DATA STREAMS (PRIMARY SOURCE) ---

    // Price updates from SignalR (now from GameHubService)
    const priceSub = this.gameHubService.priceUpdate$.subscribe(priceData => { // Subscribing to the dedicated priceUpdate$
      if (priceData && priceData.token === 'PM') {
        // FIX: Run the update inside Angular's zone to ensure the UI refreshes.
        this.ngZone.run(() => {
          this.updatePriceDataFromSignalR(priceData.price, priceData.change24h || 0);
        });
      }
    });

    // Game state changes from SignalR (now from GameHubService)
    const signalRStateSub = this.gameHubService.sessionStateChanged$.subscribe(({ status, data }) => {
      if (!data) return;
      console.log(`[SignalR] State Change: ${status}`, data);

      if (status === 'COMPLETED') {
        const completedSession = data;
        if (this.currentBet && this.currentBet.sessionId === completedSession.sessionId) {
          this.uiState = 'SHOWING_RESULT';
          this.showBetResult(completedSession);

          setTimeout(() => {
            console.log('[CLEANUP] Hiding bet displays after result shown via SignalR.');
            this.hideBetDisplays();
            this.uiState = 'BETTING';
            this.cdr.detectChanges();
          }, 4000); // Display result for 4 seconds
        }
      }
    });

    // --- POLLING FOR SYNC AND FALLBACK ---

    // Polling for the latest session state (every 4s)
    const pollingSub = this.gameService.currentSession$.subscribe(session => {
      if (!session) return;

      const previousSession = this.currentSession;
      const isNewRound = session.sessionId !== previousSession?.sessionId;

      // First, check if the current session has completed, as this is the most important event.
      if (
        this.currentBet &&
        this.currentBet.sessionId === session.sessionId &&
        session.status === GameSessionStatus.Completed &&
        previousSession?.status !== GameSessionStatus.Completed
      ) {
        console.log(`[POLL][FIX] Session ${session.sessionId} has COMPLETED. Showing result.`);
        this.currentSession = session;
        this.showBetResult(session);

        // Set a timeout to clean up the UI for the next round.
        setTimeout(() => {
          console.log('[CLEANUP] Hiding bet displays after result shown via POLLING.');
          this.hideBetDisplays();
        }, 4000); // Display result for 4 seconds
        return; // Result is shown, wait for the next poll that brings the new round.
      }

      this.currentSession = session;

      if (isNewRound) {
        console.log(`[POLL] New round detected: ${session.sessionId}. Status: ${session.status}`);

        // If a bet from a previous round is still displayed (e.g., SignalR 'COMPLETED' event was missed),
        // and the new logic above didn't catch it, clear it to avoid a stuck UI.
        if (this.currentBet && this.currentBet.sessionId !== session.sessionId) {
          console.log('[CLEANUP] Clearing stale bet from previous round on new round detection.');
          this.hideBetDisplays();
        }

        // Start the timer for any new, non-completed round.
        if (session.status !== GameSessionStatus.Completed) {
          this.startTimerForSession(session);
        }
      }
    });

    // Bot transactions
    const botSub = this.gameService.botTransactions$.subscribe(transactions => {
      this.ngZone.run(() => {
        // FIX: Update the correct property used by the template (`recentTransactions`).
        // Also, always update to handle cases where the list becomes empty, clearing the UI.
        this.recentTransactions = this.convertBotTransactionsToDisplay(transactions || []);
        // FIX: With OnPush change detection, we must manually mark the component for checking
        // when data arrives from an observable subscription.
        this.cdr.markForCheck();
      });
    });

    this.subscriptions.push(priceSub, signalRStateSub, pollingSub, botSub);
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        // 🎯 Load real PM Coin price FIRST, then initialize chart
        this.loadRealPMCoinPrice();

        // Wait a bit for price to load, then initialize chart
        setTimeout(() => {
          this.initializeTradingViewChart();
          this.initializePriceData();
          this.startChartUpdates();
        }, 200);
      }, 100);
    }
  }

  ngOnDestroy(): void {
    console.log('DEBUG: GameComponent ngOnDestroy called.');
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    // Cancel the animation frame loop when the component is destroyed
    if (this.timerLoopId) {
      cancelAnimationFrame(this.timerLoopId);
    }
    // Leave game session - NO LONGER NEEDED, GameHubService manages connection
    // if (this.currentSession) {
    //   this.signalRService.leaveGameSession(this.currentSession.sessionId);
    // }
    // Stop bot when user leaves game page
    // Cleanup TradingView chart
    this.tradingViewChartService.destroy();
  }

  private updateTimerLoop(): void {
    const remaining = Math.max(0, Math.round((this.sessionEndTime - Date.now()) / 1000));

    // Directly update the DOM element for the smoothest possible countdown
    if (this.timerValueRef?.nativeElement) {
        this.timerValueRef.nativeElement.innerText = remaining.toString();
    }

    // Also update the gameState, but do it inside the zone only if the second has changed.
    // This keeps the rest of the UI (like CSS classes) in sync without causing performance hits on every frame.
    if (this.gameState.timeLeft !== remaining) {
        this.ngZone.run(() => {
            this.gameState.timeLeft = remaining;
        });
    }

    if (remaining > 0) {
        // Continue the loop
        this.timerLoopId = requestAnimationFrame(() => this.updateTimerLoop());
    } else {
        // Timer finished, reset the ID
        this.timerLoopId = 0;
        // Final update to ensure '0' is displayed
        if (this.timerValueRef?.nativeElement) {
            this.timerValueRef.nativeElement.innerText = '0';
        }
    }
  }

  private startTimerForSession(session: CurrentGameSession) {
    console.log('DEBUG: startTimerForSession called with session:', session);
    console.log('DEBUG: startTimerForSession - session.timeLeft:', session.timeLeft);
    this.sessionEndTime = Date.now() + session.timeLeft * 1000;
    this.clearTimer();

    this.ngZone.runOutsideAngular(() => {
      this.updateTimerLoop();
    });
  }

  private clearTimer() {
    if (this.timerLoopId) {
      cancelAnimationFrame(this.timerLoopId);
      this.timerLoopId = 0;
    }
  }

  private handleSessionState(state: any): void {
    this.currentSession = state;
    this.gameState.timeLeft = state.timeLeft;
    this.gameState.canBet = state.status === 'BETTING' && !this.currentBet;
    this.gameState.isActive = state.status !== 'COMPLETED';
    
    // Join the session SignalR group - NO LONGER NEEDED, GameHubService manages connection
    // this.signalRService.joinGameSession(state.sessionId);
  }

  private handleSessionStateChange(change: {state: string, data: any}): void {
    switch (change.state) {
      case 'SETTLING':
        // Lock interface but don't clear
        this.gameState.canBet = false;
        break;
        
      case 'COMPLETED':
        if (this.currentBet) {
          this.showBetResult(change.data);
        }
        // Don't clear UI yet - wait for next session
        break;
        
      case 'BETTING':
        // New session started
        this.hideBetDisplays();
        break;
    }
  }

  private initializeGame(): void {
    // Initialize game state
    this.userBalance = this.balance;
    this.gameState.timeLeft = 60;
    this.gameState.canBet = true;
  }

  // Load real PM Coin price from database with change calculation
  private loadRealPMCoinPrice(): void {
    this.gameService.getPMCoinPriceDetail().subscribe({
      next: (priceData: any) => {
        const currentPrice = priceData.price || 11.16; // Use realistic PM Coin price
        const change24h = priceData.change24h || 0;

        // Calculate previous price from change
        const previousPrice = this.pmCoinData?.currentPrice || currentPrice;

        // Update pmCoinData with real price and change from backend
        this.pmCoinData = {
          currentPrice: currentPrice,
          previousPrice: previousPrice,
          change24h: change24h, // Real change from backend
          volume: 0,
          totalSupply: 1000000,
          timestamp: new Date(),
          priceHistory: [currentPrice]
        };
      },
      error: (error: any) => {
        // Fallback to basic price
        this.gameService.getCurrentPMCoinPrice().subscribe({
          next: (priceData: any) => {
            const currentPrice = priceData.price || 11.16; // Use realistic PM Coin price
            this.pmCoinData = {
              currentPrice: currentPrice,
              previousPrice: this.pmCoinData?.currentPrice || currentPrice,
              change24h: 0,
              volume: 0,
              totalSupply: 1000000,
              timestamp: new Date(),
              priceHistory: [currentPrice]
            };
          }
        });
      }
    });
  }

  private subscribeToData(): void {
    // Load real PM coin price from database instead of simulation
    this.loadRealPMCoinPrice();
    
    // Subscribe to REAL backend bot transactions
  }

  private startGameTimer(): void {
    // Clear any existing timer first
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
    }

    // Subscribe to game service for initial session state
    this.subscriptions.push(
      this.gameService.currentSession$.pipe(
        take(1) // Only take the first emission to get initial state
      ).subscribe({
        next: (currentSession: CurrentGameSession | null) => {
          if (currentSession) {
            // Join the session's SignalR group - NO LONGER NEEDED, GameHubService manages connection
            // this.signalRService.joinGameSession(currentSession.sessionId.toString());
            
            // Initialize game state
            this.gameState.timeLeft = currentSession.timeLeft;
            this.gameState.canBet = currentSession.status === GameSessionStatus.Betting;
            this.gameState.isActive = currentSession.status !== GameSessionStatus.Completed;
            
            // Store session info
            this.lastSessionId = currentSession.sessionId.toString();
            this.lastSessionStatus = currentSession.status;
            
            // Force change detection
            this.cdr.markForCheck();
          }
        },
        error: (error) => {
          console.error('Error getting initial session state:', error);
        }
      })
    );
  }

  private hideBetDisplays(): void {
    // Hide bet marker - clear both current and last bet
    this.bettingService.clearBetMarker();
    this.bettingService.clearCurrentBetMarker();
    
    // Hide bet info panel - FORCE clear
    this.currentBet = null;

    // ✅ Re-enable betting for new round
    this.gameState.canBet = true;

    // Clear any bet-related UI states
    // ❌ REMOVED: Reduce console spam
    // console.log('🔄 Cleared all bet displays for new round - currentBet and betMarker');
    
    // Force UI update
    // this.cdr.detectChanges(); // REMOVED: This was causing the ExpressionChangedAfterItHasBeenCheckedError
  }

  private showBetResult(session: any): void {
    console.log('🎲 showBetResult called:', { session, currentBet: this.currentBet });

    if (this.currentBet) {
      const startPrice = this.currentBet.startPrice;
      const endPrice = (session.finalPrice ?? session.currentPrice);

      let result: 'win' | 'lose' | 'tie';
      if (endPrice > startPrice && this.currentBet.direction === 'up') {
        result = 'win';
      } else if (endPrice < startPrice && this.currentBet.direction === 'down') {
        result = 'win';
      } else if (endPrice === startPrice) {
        result = 'tie';
      } else {
        result = 'lose';
      }

      // CRITICAL FIX: The frontend now controls when the result notification is shown.
      // This prevents the race condition where a notification arrives before the timer ends.
      // We construct the message here, ensuring it's in sync with the UI state.
      const priceChange = endPrice - startPrice;
      const priceChangePercent = startPrice > 0 ? (priceChange / startPrice) * 100 : 0;
      const priceDirection = priceChange > 0 ? "tăng" : priceChange < 0 ? "giảm" : "không đổi";
      const priceChangeText = `| Giá ${priceDirection} ${Math.abs(priceChangePercent).toFixed(2)}%`;

      const payout = result === 'win' ? this.currentBet.amount * 1.9 : (result === 'tie' ? this.currentBet.amount : 0);
      const formattedAmount = this.formatPMAmount(this.currentBet.amount);

      if (result === 'win') {
        const formattedPayout = this.formatPMAmount(payout);
        this.notificationService.show(`🎉 Thắng cược! Nhận được ${formattedPayout} PM ${priceChangeText}`, 'success');
      } else if (result === 'tie') {
        const formattedPayout = this.formatPMAmount(payout);
        this.notificationService.show(`🔄 Hòa! Hoàn lại ${formattedPayout} PM ${priceChangeText}`, 'info');
      } else {
        this.notificationService.show(`😔 Thua cược ${formattedAmount} PM ${priceChangeText}`, 'error');
      }

      // Resolve bet marker with result
      this.bettingService.resolveBetMarker(endPrice, result === 'win' ? 'WIN' : result === 'tie' ? 'DRAW' : 'LOSE', payout.toString());

      // Update user balance after win/tie
      if (result === 'win' || result === 'tie') {
        const userAddress = this.metaMaskService.getCurrentAddress();
        if (userAddress) {
          this.bettingService.updateUserBalances(userAddress);
          console.log('💰 Updated user balance after', result, 'payout:', payout);
        }
      }

      // Keep bet information displayed until new round starts (handled in startGameTimer)
      console.log('🔒 Keeping bet information displayed until new round starts');
    }
  }

  private processRound(): void {
    if (this.currentBet && this.pmCoinData) {
      const startPrice = this.currentBet.startPrice;
      const endPrice = this.pmCoinData.currentPrice;
      const isWin =
        (this.currentBet.direction === 'up' && endPrice > startPrice) ||
        (this.currentBet.direction === 'down' && endPrice < startPrice);

      // Calculate price change
      const priceChange = (this.pmCoinData?.currentPrice || 0) - this.currentBet.startPrice;

      // Determine result for bet marker
      let betResult: 'WIN' | 'LOSE' | 'DRAW' = 'LOSE';
      let payout = '0';

      if (Math.abs(priceChange) < 0.0001) {
        // Draw case - price didn't change significantly
        betResult = 'DRAW';
        payout = this.currentBet.amount.toString();
      } else if (isWin) {
        betResult = 'WIN';
        const profit = this.currentBet.amount * 1.9;
        payout = profit.toString();
        this.balance += profit;
        this.gameStats.totalProfit += profit - this.currentBet.amount;
        this.gameStats.currentStreak++;
      } else {
        betResult = 'LOSE';
        payout = '0';
        this.gameStats.totalProfit -= this.currentBet.amount;
        this.gameStats.currentStreak = 0;
      }

      // Resolve bet marker
      this.bettingService.resolveBetMarker(
        this.pmCoinData?.currentPrice || 0,
        betResult,
        payout
      );

      this.gameStats.gamesPlayed++;
      this.gameStats.winRate =
        this.gameStats.gamesPlayed > 0
          ? ((this.gameStats.gamesPlayed - this.getWinCount()) /
              this.gameStats.gamesPlayed) *
            100
          : 0;

      this.currentBet = null;
    }
  }

  private getWinCount(): number {
    return Math.floor(
      this.gameStats.gamesPlayed * (this.gameStats.winRate / 100)
    );
  }

  // Chart methods - using TradingView Lightweight Charts
  private initializeTradingViewChart(): void {
    console.log('DEBUG: initializeTradingViewChart called.');
    if (!this.chartContainerRef) {
      return;
    }

    const container = this.chartContainerRef.nativeElement;
    this.tradingViewChartService.initializeChart(container);
  }

  private initializePriceData(): void {
    // Load real PM Coin data from database and convert to line chart
    this.gameService.getPMCoinCandlestickData(24).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          // Convert database candlestick data to line chart (use close prices)
          this.priceData = data.map(item => ({
            time: item.time, // Unix timestamp in seconds
            value: item.close // Use close price for line chart
          }));
        } else {
          // Fallback to simulation if no database data
          this.generateFallbackLineData();
        }

        // Sort data before mapping to ensure ascending order
        this.priceData.sort((a, b) => a.time - b.time);

        // Convert to TradingView line format and set data
        const tradingViewData = this.priceData.map(point => ({
          time: point.time as Time,
          value: point.value
        }));

        this.tradingViewChartService.setLineData(tradingViewData);
      },
      error: (_error: any) => {
        this.generateFallbackLineData();
      }
    });
  }

  private generateFallbackLineData(): void {
    // Generate fallback line data for UP/DOWN game using REAL PM Coin price
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    // 🎯 Use REAL PM Coin price as base instead of hardcoded 125
    const basePrice = this.pmCoinData?.currentPrice || 11.16; // Use real price
    let price = basePrice;

    for (let i = 0; i < 50; i++) {
      const timestamp = now - (50 - i) * 60; // 1 minute intervals
      const change = (Math.random() - 0.5) * (basePrice * 0.02); // 2% variation relative to base price
      price += change;

      this.priceData.push({
        time: timestamp,
        value: Math.max(basePrice * 0.8, price) // Keep price above 80% of base
      });
    }
  }

  private startChartUpdates(): void {
    // ❌ REMOVED: Fake price updates every 1s
    // Chart will only update when real price changes come from SignalR
  }

  private updatePriceDataFromSignalR(realPrice: number, change24h: number = 0): void {
    // console.log('DEBUG: updatePriceDataFromSignalR called with price:', realPrice);
    const now = Date.now();

    // Update pmCoinData display with REAL price from database
    if (this.pmCoinData) {
      this.pmCoinData.previousPrice = this.pmCoinData.currentPrice;
      this.pmCoinData.currentPrice = realPrice;
      this.pmCoinData.change24h = change24h;
      this.pmCoinData.timestamp = new Date();
    }

    // 📊 Add REAL price point to line chart (NO fake movement)
    const timestamp = Math.floor(now / 1000); // Unix timestamp in seconds

    // 🎯 Ensure unique timestamps by checking last point
    const lastPoint = this.priceData[this.priceData.length - 1];
    const uniqueTimestamp = lastPoint && lastPoint.time >= timestamp
      ? lastPoint.time + 1
      : timestamp;

    const newPricePoint: PricePoint = {
      time: uniqueTimestamp,
      value: Math.max(0.01, realPrice) // Keep price above $0.01
    };

    this.priceData.push(newPricePoint);

    // Keep only last 100 points for better performance
    if (this.priceData.length > 100) {
      this.priceData.shift();
    }

    // 📊 OPTIMIZATION: Update chart with the single new point instead of re-rendering the whole dataset.
    // This is much more performant and avoids blocking the main thread.
    const series = this.tradingViewChartService.getLineSeries();
    if (series) {
      const newChartPoint = {
        time: newPricePoint.time as Time,
        value: newPricePoint.value
      };
      // The 'update' method is highly efficient for real-time data.
      series.update(newChartPoint);
    }
  }

  // Game methods
  setBetAmount(amount: number): void {
    this.betAmount = amount;
  }

  // Balance management methods
  getTotalBalance(balances?: any): number {
    // With the new contract, there is only one balance: the wallet balance.
    // The 'gameBalance' from the service now represents this wallet balance.
    if (!balances) return 0;
    return parseFloat(balances.gameBalance || '0');
  }

  getGameBalance(balances?: any): number {
    if (!balances) return 0;
    return parseFloat(balances.gameBalance || '0');
  }

  // Deposit/Withdraw functions are removed as they are no longer part of the game logic.
  // The betting service now handles token approval and direct transfer via placeBet.

  // Format number with commas
  formatBalance(amount: number): string {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    });
  }

  // Format PM amount for display (remove trailing zeros)
  formatPMAmount(amount: number | string): string {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    // Convert to string and remove trailing zeros
    const formatted = numAmount.toFixed(6).replace(/\.?0+$/, '');
    return formatted;
  }

  // Parse string to float safely
  parseFloat(value: string): number {
    return parseFloat(value || '0');
  }

  canPlaceBet(): boolean {
    return (
      !this.currentBet && // Rely on this as the primary lock
      this.betAmount > 0 &&
      this.gameState.timeLeft > 30
    );
  }

  async placeBet(direction: 'up' | 'down'): Promise<void> {
    if (!this.canPlaceBet()) return;

    // ✅ LOCK betting buttons to prevent double click
    this.gameState.canBet = false;

    // Get current wallet info
    const walletInfo = this.metaMaskService.getCurrentAddress();
    if (!walletInfo) {
      this.notificationService.show('Vui lòng kết nối ví MetaMask trước', 'error');
      this.gameState.canBet = true; // ✅ Re-enable if error
      return;
    }

    // Check if user has sufficient balance
    if (!this.bettingService.canPlaceBet(this.betAmount.toString())) {
      this.notificationService.show('Không đủ số dư để đặt cược', 'error');
      this.gameState.canBet = true; // ✅ Re-enable if insufficient balance
      return;
    }

    // Animate button
    gsap.fromTo(
      '.bet-btn',
      { scale: 1 },
      { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1 }
    );

    this.ngZone.runOutsideAngular(async () => {
      try {
        // Place bet using betting service
        const result = await this.bettingService.placeBet({
          amount: this.betAmount.toString(),
          direction,
          userAddress: walletInfo
        });

        this.ngZone.run(() => {
          if (result.success) {
            // Update bet marker with current price
            this.bettingService.updateBetMarkerStartPrice(this.pmCoinData?.currentPrice || 0);

            this.currentBet = {
              direction,
              amount: this.betAmount,
              timestamp: new Date(),
              startPrice: this.pmCoinData?.currentPrice || 0,
              transactionHash: result.transactionHash,
              // FIX: Use the sessionId from the backend response to avoid race conditions.
              sessionId: result.sessionId,
            };

            // Show bet confirmation
            console.log(`🎲 Bet placed: ${direction.toUpperCase()} ${this.betAmount} PM at price ${this.pmCoinData?.currentPrice}`);
            console.log('DEBUG: result.success:', result.success);
            console.log('DEBUG: currentBet after setting:', this.currentBet);
            this.cdr.detectChanges(); // FORCE CHANGE DETECTION
          } else {
            console.error('Bet failed:', result.error);
            this.notificationService.show(`Đặt cược thất bại: ${result.error}`, 'error');
            this.gameState.canBet = true; // ✅ Re-enable if bet failed
          }
        });
      } catch (error) {
        this.ngZone.run(() => {
          console.error('Error placing bet:', error);
          this.notificationService.show('Lỗi khi đặt cược. Vui lòng thử lại.', 'error');
          this.gameState.canBet = true; // ✅ Re-enable if error
        });
      }
    });
  }

  // Utility methods
  formatPrice(price: number): string {
    return price.toFixed(6);
  }

  formatPercentage(percentage: number): string {
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
  }

  getBetChangeClass(): string {
    if (!this.currentBet || !this.pmCoinData?.currentPrice) return '';

    const change = this.pmCoinData.currentPrice - this.currentBet.startPrice;
    if (Math.abs(change) < 0.0001) return 'no-change';

    const isWinning = (this.currentBet.direction === 'up' && change > 0) ||
                     (this.currentBet.direction === 'down' && change < 0);

    return isWinning ? 'winning' : 'losing';
  }

  getBetChangeText(): string {
    if (!this.currentBet || !this.pmCoinData?.currentPrice) return '';

    const change = this.pmCoinData.currentPrice - this.currentBet.startPrice;
    const changePercent = (change / this.currentBet.startPrice) * 100;

    if (Math.abs(change) < 0.0001) return 'Không đổi';

    const isWinning = (this.currentBet.direction === 'up' && change > 0) ||
                     (this.currentBet.direction === 'down' && change < 0);

    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(6)} (${sign}${changePercent.toFixed(2)}%) - ${isWinning ? 'THẮNG' : 'THUA'}`;
  }

  getPredictionStatus(betMarker: BetMarker): string {
    if (!this.pmCoinData?.currentPrice || betMarker.startPrice <= 0) return '';

    const change = this.pmCoinData.currentPrice - betMarker.startPrice;
    if (Math.abs(change) < 0.0001) return 'draw';

    const isWinning = (betMarker.direction === 'up' && change > 0) ||
                     (betMarker.direction === 'down' && change < 0);

    return isWinning ? 'winning' : 'losing';
  }

  getPredictionStatusText(betMarker: BetMarker): string {
    if (!this.pmCoinData?.currentPrice || betMarker.startPrice <= 0) return 'Chờ giá...';

    const change = this.pmCoinData.currentPrice - betMarker.startPrice;
    const changePercent = (change / betMarker.startPrice) * 100;

    if (Math.abs(change) < 0.0001) return 'HÒA';

    const isWinning = (betMarker.direction === 'up' && change > 0) ||
                     (betMarker.direction === 'down' && change < 0);

    const sign = change > 0 ? '+' : '';
    return `${isWinning ? 'ĐANG THẮNG' : 'ĐANG THUA'} (${sign}${changePercent.toFixed(2)}%)`;
  }

  formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  getPriceChangeClass(): string {
    if (!this.pmCoinData) return '';
    return this.pmCoinData.change24h >= 0 ? 'price-up' : 'price-down';
  }

  getChange24hClass(): string {
    if (!this.pmCoinData) return '';
    return this.pmCoinData.change24h >= 0 ? 'change-up' : 'change-down';
  }

  trackTransaction(index: number, transaction: any): any {
    return transaction.id || index;
  }

  formatWalletAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  formatAmount(amount: number): string {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + 'K';
    }
    return amount.toString();
  }

  formatBetTime(startTime: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) {
      return `${diffSeconds}s trước`;
    } else if (diffSeconds < 3600) {
      const minutes = Math.floor(diffSeconds / 60);
      return `${minutes}m trước`;
    } else {
      return startTime.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  formatTxHash(hash: string): string {
    if (!hash) return '';
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  }

  private updateTradingViewChart(): void {
    // 🔍 Check if chart is initialized
    if (!this.tradingViewChartService.getLineSeries()) {
      return;
    }

    if (this.priceData.length === 0) return;

    // 🔄 Sort data before mapping to ensure ascending order
    const sortedData = this.priceData.sort((a, b) => a.time - b.time);

    // Convert to TradingView line format
    const tradingViewData = sortedData.map(point => ({
      time: point.time as Time,
      value: point.value
    }));

    // 📊 Set all data to TradingView line series
    this.tradingViewChartService.getLineSeries()?.setData(tradingViewData);
  }

  // Convert backend bot transactions to display format
  private convertBotTransactionsToDisplay(botTransactions: BotTransaction[]): SimulatedTransaction[] {
    return botTransactions.map(bot => ({
      id: `bot_${Date.now()}_${Math.random()}`,
      user: this.formatWalletAddress(bot.botAddress),
      walletAddress: bot.botAddress,
      action: bot.action.toLowerCase() as 'buy' | 'sell',
      amount: bot.amount,
      price: bot.price,
      timestamp: new Date(bot.timestamp)
    }));
  }

  // Real-time market activity update - NO ANIMATION to prevent rerender
  private updateMarketActivityRealTime(): void {
    // Removed animation to prevent rerender issues
    // Just update data silently
  }

  

  

  public async refreshContractBalance(): Promise<void> {
    this.contractBalance = 'Loading...';
    try {
      // Make sure wallet is connected to initialize the contract service
      const isConnected = await this.metaMaskService.isConnected();
      if (!isConnected) {
        await this.smartContractService.connectWallet();
      }
      const stats = await this.smartContractService.getContractStats(); // This now works
      this.contractBalance = parseFloat(stats.treasuryBalance).toLocaleString('en-US', { maximumFractionDigits: 2 });
    } catch (error) {
      console.error('Failed to refresh contract balance:', error);
      this.contractBalance = 'Error';
    }
  }
}