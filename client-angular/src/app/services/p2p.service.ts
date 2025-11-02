import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, interval } from 'rxjs';
import { environment } from '../../environments/environment';
import { SignalRService } from '../core/services/signalr.service';

export interface P2POrder {
  id: string;
  seller: string;
  buyer?: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  status: 'active' | 'matched' | 'completed' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
  txHash?: string;
  isMatching?: boolean;
}

export interface CreateP2POrderRequest {
  sellToken: string;
  buyToken: string;
  sellAmount: number;
  walletAddress: string;
  expiryHours?: number;
}

export interface MatchP2POrderRequest {
  orderId: string;
  walletAddress: string;
}

export interface P2POrderFilter {
  sellToken?: string;
  buyToken?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface TokenPrice {
  token: string;
  price: number;
  change24h: number;
  lastUpdated: string;
  source: string;
}

export interface PriceCalculation {
  sellToken: string;
  buyToken: string;
  sellAmount: number;
  buyAmount: number;
  exchangeRate: number;
  sellTokenPrice: number;
  buyTokenPrice: number;
  calculatedAt: string;
}

export interface P2PStats {
  totalActiveOrders: number;
  totalCompletedOrders: number;
  totalVolumeUSD: number;
  ordersByToken: { [key: string]: number };
  volumeByToken: { [key: string]: number };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message: string;
  errors?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class P2PService {
  private readonly apiUrl = `${environment.apiUrl}/api/p2p`;

  // Real-time data subjects
  private activeOrdersSubject = new BehaviorSubject<P2POrder[]>([]);
  private tokenPricesSubject = new BehaviorSubject<{ [key: string]: number }>(
    {}
  );
  private pmCoinPriceSubject = new BehaviorSubject<TokenPrice | null>(null);

  // Public observables
  public activeOrders$ = this.activeOrdersSubject.asObservable();
  public tokenPrices$ = this.tokenPricesSubject.asObservable();
  public pmCoinPrice$ = this.pmCoinPriceSubject.asObservable();

  // Supported tokens
  public readonly supportedTokens = ['BTC', 'ETH', 'PM', 'VND'];

  constructor(private http: HttpClient, private signalRService: SignalRService) {
    this.startRealTimeUpdates();
    // Removed setupSignalRSubscriptions as it's no longer needed for this service
  }

  // ===== ORDER MANAGEMENT =====

  getActiveOrders(
    filter?: P2POrderFilter
  ): Observable<ApiResponse<P2POrder[]>> {
    let params = new HttpParams();

    if (filter) {
      if (filter.sellToken) params = params.set('sellToken', filter.sellToken);
      if (filter.buyToken) params = params.set('buyToken', filter.buyToken);
      if (filter.status) params = params.set('status', filter.status);
      if (filter.minAmount)
        params = params.set('minAmount', filter.minAmount.toString());
      if (filter.maxAmount)
        params = params.set('maxAmount', filter.maxAmount.toString());
      if (filter.page) params = params.set('page', filter.page.toString());
      if (filter.pageSize)
        params = params.set('pageSize', filter.pageSize.toString());
      if (filter.sortBy) params = params.set('sortBy', filter.sortBy);
      if (filter.sortOrder) params = params.set('sortOrder', filter.sortOrder);
    }

    return this.http.get<ApiResponse<P2POrder[]>>(`${this.apiUrl}/orders`, {
      params,
    });
  }

  getMyOrders(filter?: P2POrderFilter): Observable<ApiResponse<P2POrder[]>> {
    let params = new HttpParams();

    if (filter) {
      if (filter.status) params = params.set('status', filter.status);
      if (filter.page) params = params.set('page', filter.page.toString());
      if (filter.pageSize)
        params = params.set('pageSize', filter.pageSize.toString());
    }

    return this.http.get<ApiResponse<P2POrder[]>>(`${this.apiUrl}/my-orders`, {
      params,
    });
  }

  getOrderById(orderId: string): Observable<ApiResponse<P2POrder>> {
    return this.http.get<ApiResponse<P2POrder>>(
      `${this.apiUrl}/orders/${orderId}`
    );
  }

  createOrder(
    request: CreateP2POrderRequest
  ): Observable<ApiResponse<P2POrder>> {
    return this.http.post<ApiResponse<P2POrder>>(
      `${this.apiUrl}/orders`,
      request
    );
  }

  matchOrder(
    orderId: string,
    walletAddress: string
  ): Observable<ApiResponse<P2POrder>> {
    const request: MatchP2POrderRequest = { orderId, walletAddress };
    return this.http.post<ApiResponse<P2POrder>>(
      `${this.apiUrl}/orders/${orderId}/match`,
      request
    );
  }

  cancelOrder(orderId: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(
      `${this.apiUrl}/orders/${orderId}`
    );
  }

  // ===== PRICE MANAGEMENT =====

  calculateExchange(
    sellToken: string,
    buyToken: string,
    sellAmount: number
  ): Observable<ApiResponse<PriceCalculation>> {
    const body = {
      sellToken: sellToken,
      buyToken: buyToken,
      sellAmount: sellAmount
    };

    return this.http.post<ApiResponse<PriceCalculation>>(
      `${this.apiUrl}/calculate-price`,
      body
    );
  }

  getAllTokenPrices(): Observable<ApiResponse<{ [key: string]: number }>> {
    return this.http.get<ApiResponse<{ [key: string]: number }>>(
      `${this.apiUrl}/prices`
    );
  }

  getPMCoinPrice(): Observable<ApiResponse<TokenPrice>> {
    return this.http.get<ApiResponse<TokenPrice>>(`${this.apiUrl}/prices/pm`);
  }

  updatePMCoinPrice(
    price: number,
    source?: string,
    reason?: string
  ): Observable<ApiResponse<boolean>> {
    const request = { price, source, reason };
    return this.http.post<ApiResponse<boolean>>(
      `${this.apiUrl}/prices/pm`,
      request
    );
  }

  // ===== STATISTICS =====

  getStats(): Observable<ApiResponse<P2PStats>> {
    return this.http.get<ApiResponse<P2PStats>>(`${this.apiUrl}/stats`);
  }

  // ===== REAL-TIME UPDATES (POLLING) =====

  private startRealTimeUpdates(): void {
    // Update active orders every 30 seconds
    interval(30000).subscribe(() => {
      this.refreshActiveOrders();
    });

    // Update token prices every 60 seconds
    interval(60000).subscribe(() => {
      this.refreshTokenPrices();
    });

    // Update PM coin price every 10 seconds
    interval(10000).subscribe(() => {
      this.refreshPMCoinPrice();
    });

    // Initial load
    this.refreshActiveOrders();
    this.refreshTokenPrices();
    this.refreshPMCoinPrice();
  }

  private refreshActiveOrders(): void {
    this.getActiveOrders({ pageSize: 50 }).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.activeOrdersSubject.next(response.data);
        }
      },
      error: (error) => {
        console.error('Error refreshing active orders:', error);
      },
    });
  }

  private refreshTokenPrices(): void {
    this.getAllTokenPrices().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.tokenPricesSubject.next(response.data);
        }
      },
      error: (error) => {
        console.error('Error refreshing token prices:', error);
      },
    });
  }

  private refreshPMCoinPrice(): void {
    this.getPMCoinPrice().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.pmCoinPriceSubject.next(response.data);
        }
      },
      error: (error) => {
        console.error('Error refreshing PM coin price:', error);
      },
    });
  }

  // ===== UTILITY METHODS =====

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(price);
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(amount);
  }

  getTokenIcon(token: string): string {
    const icons: { [key: string]: string } = {
      BTC: '₿',
      ETH: 'Ξ',
      PM: '💎',
      VND: '₫',
      DOGE: '🐕',
    };
    return icons[token] || '🪙';
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      ACTIVE: '#10b981',
      MATCHED: '#f59e0b',
      COMPLETED: '#3b82f6',
      CANCELLED: '#ef4444',
      EXPIRED: '#6b7280',
    };
    return colors[status] || '#6b7280';
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      ACTIVE: 'Đang hoạt động',
      MATCHED: 'Đã khớp',
      COMPLETED: 'Hoàn thành',
      CANCELLED: 'Đã hủy',
      EXPIRED: 'Hết hạn',
    };
    return texts[status] || status;
  }

  // ===== TRANSACTION HISTORY METHODS =====

  saveTransactionHistory(transactionData: SaveTransactionHistoryRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/transactions`, transactionData);
  }

  getUserTransactionHistory(page: number = 1, pageSize: number = 20): Observable<ApiResponse<TransactionHistory[]>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    return this.http.get<ApiResponse<TransactionHistory[]>>(`${this.apiUrl}/transactions/history`, { params });
  }
}

// ===== TRANSACTION HISTORY INTERFACES =====

export interface TransactionHistory {
  id: string;
  txHash: string;
  sellToken: string;
  buyToken: string;
  sellAmount: number;
  buyAmount: number;
  sellerAddress: string;
  buyerAddress?: string;
  status: string;
  transactionType: string;
  blockNumber?: number;
  gasUsed?: number;
  gasFee?: number;
  transactionTime: string;
  notes?: string;
}

export interface SaveTransactionHistoryRequest {
  txHash: string;
  sellToken: string;
  buyToken: string;
  sellAmount: number;
  buyAmount: number;
  sellerAddress: string;
  buyerAddress?: string;
  status: string;
  blockNumber?: number;
  gasUsed?: number;
  transactionTime: Date;
}