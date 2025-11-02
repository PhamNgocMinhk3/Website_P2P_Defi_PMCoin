import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval, timer } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export enum GameSessionStatus {
  Betting = 'BETTING',
  Locked = 'LOCKED',
  Settling = 'SETTLING',
  Completed = 'COMPLETED'
}

export interface CurrentGameSession {
  sessionId: string;
  startTime: string;
  endTime: string;
  startPrice: number;
  currentPrice: number;
  finalPrice?: number; // final price if available
  status: GameSessionStatus;
  timeLeft: number;
  canPlaceBet: boolean;
}

export interface ProfitAnalysis {
  sessionId: string;
  totalUpBets: number;
  totalDownBets: number;
  upWinProfit: number;
  downWinProfit: number;
  recommendedOutcome: string;
  manipulationNeeded: boolean;
  totalBetCount: number;
  updatedAt: string;
  totalBetVolume: number;
  betRatio: number;
  betDistribution: string;
  maxProfit: number;
  minProfit: number;
  profitSummary: string;
}

export interface ActiveBet {
  betId: string;
  userAddress: string;
  direction: string;
  amount: number;
  payoutRatio: number;
  createdAt: string;
}

export interface BotTransaction {
  botAddress: string;
  action: string;
  amount: number;
  price: number;
  priceImpact: number;
  timestamp: string;
  change?: number;
  changePercent?: number;
  reason?: string;
}

export interface DailyTarget {
  date: string;
  startBalance: number;
  currentBalance: number;
  targetPercentage: number;
  targetAmount: number;
  achievedAmount: number;
  isTargetAchieved: boolean;
  progressPercentage: number;
  totalRounds: number;
  profitableRounds: number;
  winRate: number;
}

export interface UserGameStats {
  walletAddress: string;
  totalBets: number;
  totalWins: number;
  totalLoses: number;
  winRate: number;
  totalBetAmount: number;
  totalWinAmount: number;
  totalLoseAmount: number;
  consecutiveWins: number;
  consecutiveLoses: number;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
  lastBetTime?: string;
  blacklistedAt?: string;
  whitelistedAt?: string;
}

export interface PlaceBetRequest {
  userAddress: string;
  direction: string; // 'UP' or 'DOWN'
  amount: number;
  contractBetId: number;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private apiUrl = environment.apiUrl;

  private syncWithServer(sessionId: string): void {
    this.getCurrentSession().subscribe({
      next: (serverSession) => {
        if (serverSession && serverSession.sessionId === sessionId) {
          const currentSession = this.currentSessionSubject.value;
          if (currentSession) {
            // Check if server time differs by more than 1 second
            const timeDiff = Math.abs(serverSession.timeLeft - currentSession.timeLeft);
            if (timeDiff > 1) {
              console.log(`Syncing with server: local=${currentSession.timeLeft}s, server=${serverSession.timeLeft}s`);
              this.currentSessionSubject.next(serverSession);
            }
          }
        }
      },
      error: (error) => console.error('Server sync failed:', error)
    });
  }
  
  // Real-time data subjects
  private currentSessionSubject = new BehaviorSubject<CurrentGameSession | null>(null);
  private profitAnalysisSubject = new BehaviorSubject<ProfitAnalysis | null>(null);
  private activeBetsSubject = new BehaviorSubject<ActiveBet[]>([]);
  private botTransactionsSubject = new BehaviorSubject<BotTransaction[]>([]);
  private dailyTargetSubject = new BehaviorSubject<DailyTarget | null>(null);

  // Public observables
  public currentSession$ = this.currentSessionSubject.asObservable();
  public profitAnalysis$ = this.profitAnalysisSubject.asObservable();
  public activeBets$ = this.activeBetsSubject.asObservable();
  public botTransactions$ = this.botTransactionsSubject.asObservable();
  public dailyTarget$ = this.dailyTargetSubject.asObservable();

  private subscriptions: any[] = [];

  constructor(private http: HttpClient) {
    this.startRealTimeUpdates();
  }

  // API Methods
  getCurrentSession(): Observable<CurrentGameSession> {
    // Reverting to the original endpoint. The backend logic for this endpoint has been fixed
    // to return the latest session state, including 'COMPLETED' ones.
    return this.http.get<CurrentGameSession>(`${this.apiUrl}/api/game/current-session`);
  }

  placeBet(request: PlaceBetRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/game/bet`, request);
  }

  getActiveBets(sessionId: string): Observable<ActiveBet[]> {
    return this.http.get<ActiveBet[]>(`${this.apiUrl}/api/game/active-bets/${sessionId}`);
  }

  getProfitAnalysis(sessionId: string): Observable<ProfitAnalysis> {
    return this.http.get<ProfitAnalysis>(`${this.apiUrl}/api/game/profit-analysis/${sessionId}`);
  }

  getPMPriceHistory(timeRange: string = '1h'): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/api/game/pm-price-history?timeRange=${timeRange}`);
  }

  getBotTransactions(limit: number = 20): Observable<BotTransaction[]> {
    return this.http.get<BotTransaction[]>(`${this.apiUrl}/api/game/bot-transactions?limit=${limit}`);
  }

  // Get real PM Coin candlestick data from database
  getPMCoinCandlestickData(hours: number = 24): Observable<any[]> {
    // Convert hours to the timeRange string format expected by the backend
    let timeRange: string;
    if (hours <= 1) {
      timeRange = '1h';
    } else if (hours <= 4) {
      timeRange = '4h';
    } else {
      timeRange = '1d'; // Default to 1 day for 24 hours or more
    }

    return this.http.get<any[]>(`${this.apiUrl}/api/game/pm-price-history?timeRange=${timeRange}`).pipe(
      map(data => {
        if (!Array.isArray(data)) {
          console.error('Price history data is not an array:', data);
          return []; // Return empty array on error to prevent further issues
        }
        return data.sort((a, b) => a.time - b.time);
      })
    );
  }

  // Get current PM Coin price
  getCurrentPMCoinPrice(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/api/game/current-session`).pipe(
      map((response: any) => ({
        price: response.currentPrice,
        timestamp: new Date()
      }))
    );
  }

  // Get PM Coin price details with change24h
  getPMCoinPriceDetail(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/api/p2p/prices/pm`).pipe(
      map((response: any) => ({
        price: response.data.price,
        change24h: response.data.change24h,
        token: response.data.token,
        lastUpdated: response.data.lastUpdated,
        source: response.data.source
      }))
    );
  }

  // Update PM Coin price (for bot trading simulation)
  updatePMCoinPrice(price: number, source?: string, reason?: string): Observable<any> {
    const body = {
      price: price,
      source: source || 'MARKET_ACTIVITY',
      reason: reason || 'Bot trading simulation'
    };
    return this.http.post<any>(`${this.apiUrl}/api/p2p/prices/pm/update`, body);
  }

  getDailyTarget(): Observable<DailyTarget> {
    return this.http.get<DailyTarget>(`${this.apiUrl}/api/game/daily-target`);
  }

  getUserStats(userAddress: string): Observable<UserGameStats> {
    return this.http.get<UserGameStats>(`${this.apiUrl}/user-stats/${userAddress}`);
  }

  

  // Get blacklisted users
  async getBlacklistedUsers(): Promise<any[]> {
    try {
      const response = await this.http.get<any[]>(`${this.apiUrl}/api/game/blacklisted-users`).toPromise();
      return response || [];
    } catch (error) {
      console.error('Error fetching blacklisted users:', error);
      return [];
    }
  }

  // Get whitelisted users
  async getWhitelistedUsers(): Promise<any[]> {
    try {
      const response = await this.http.get<any[]>(`${this.apiUrl}/api/game/whitelisted-users`).toPromise();
      return response || [];
    } catch (error) {
      console.error('Error fetching whitelisted users:', error);
      return [];
    }
  }

  // Real-time updates
  private startRealTimeUpdates(): void {
    // Lấy session ban đầu
    this.getCurrentSession().subscribe({
      next: (session) => {
        console.log('DEBUG: GameService: Initial session fetched:', session);
        // The component is now responsible for the countdown timer.
        this.currentSessionSubject.next(session);
      },
      error: (error) => {
        console.error('Error getting initial session:', error);
      }
    });

    // Update market data every 4 seconds - SYNC với bot
    interval(4000).subscribe(() => {
      this.updateBotTransactions();
      this.updateDailyTarget();

      // Sync session state from server every 4 seconds.
      // The component will handle the countdown smoothly.
      // console.log('DEBUG: GameService: 4-second interval triggered, calling updateCurrentSession.');
      this.updateCurrentSession();
    });

    // Update active bets and profit analysis every 1 second
    interval(1000).subscribe(() => {
      const currentSession = this.currentSessionSubject.value;
      if (currentSession) {
        this.updateActiveBets(currentSession.sessionId);
        this.updateProfitAnalysis(currentSession.sessionId);
      }
    });
  }

  private updateCurrentSession(): void {
    this.getCurrentSession().subscribe({
      next: (serverSession) => {
        // FIX: LUÔN LUÔN cập nhật dữ liệu phiên mới nhất từ server.
        // Điều này đảm bảo rằng khi người dùng điều hướng qua lại các trang,
        // component game sẽ luôn nhận được 'timeLeft' và 'currentPrice' mới nhất
        // để khởi động lại timer và cập nhật UI, tránh bị "đơ".
        this.currentSessionSubject.next(serverSession);
      },
      error: (error) => {
        // Only log connection errors once to avoid spam
        if (error.status === 0) {
          // Giảm log spam khi không có kết nối
          // console.warn('Backend connection unavailable - running in offline mode');
        } else {
          console.error('Error updating current session:', error);
        }
      }
    });
  }

  private updateActiveBets(sessionId: string): void {
    this.getActiveBets(sessionId).subscribe({
      next: (bets) => {
        this.activeBetsSubject.next(bets);
      },
      error: (error) => {
        // Only log connection errors once to avoid spam
        if (error.status === 0) {
          console.warn('Backend connection unavailable - running in offline mode');
        } else {
          console.error('Error updating active bets:', error);
        }
      }
    });
  }

  private updateProfitAnalysis(sessionId: string): void {
    this.getProfitAnalysis(sessionId).subscribe({
      next: (analysis) => {
        this.profitAnalysisSubject.next(analysis);
      },
      error: (error) => {
        // Only log connection errors once to avoid spam
        if (error.status === 0) {
          console.warn('Backend connection unavailable - running in offline mode');
        } else {
          console.error('Error updating profit analysis:', error);
        }
      }
    });
  }

  private updateBotTransactions(): void {
    this.getBotTransactions(10).subscribe({
      next: (transactions) => {
        this.botTransactionsSubject.next(transactions);
      },
      error: (error) => {
        // Only log connection errors once to avoid spam
        if (error.status === 0) {
          console.warn('Backend connection unavailable - running in offline mode');
        } else {
          console.error('Error updating bot transactions:', error);
        }
      }
    });
  }

  private updateDailyTarget(): void {
    this.getDailyTarget().subscribe({
      next: (target) => {
        this.dailyTargetSubject.next(target);
      },
      error: (error) => {
        // Only log connection errors once to avoid spam
        if (error.status === 0) {
          console.warn('Backend connection unavailable - running in offline mode');
        } else {
          console.error('Error updating daily target:', error);
        }
      }
    });
  }

  // Helper methods
  formatAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Get current values (synchronous)
  getCurrentSessionValue(): CurrentGameSession | null {
    return this.currentSessionSubject.value;
  }

  getProfitAnalysisValue(): ProfitAnalysis | null {
    return this.profitAnalysisSubject.value;
  }

  getActiveBetsValue(): ActiveBet[] {
    return this.activeBetsSubject.value;
  }

  getBotTransactionsValue(): BotTransaction[] {
    return this.botTransactionsSubject.value;
  }

  getDailyTargetValue(): DailyTarget | null {
    return this.dailyTargetSubject.value;
  }

  ngOnDestroy(): void {
    // Clear all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
