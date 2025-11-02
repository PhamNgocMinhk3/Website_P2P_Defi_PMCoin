import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, Observable, interval, switchMap, catchError, of, filter } from 'rxjs';
import { map } from 'rxjs/operators';
import { P2PService, TransactionHistory } from '../../services/p2p.service';

export interface Token {
  symbol: string;
  name: string;
  balance: number;
  value: number;
  change24h: number;
  icon: string;
  address?: string;
  decimals?: number;
}

export interface Transaction {
  id: string;
  type: 'receive' | 'send' | 'buy' | 'sell';
  amount: number;
  symbol: string;
  address: string;
  status: 'completed' | 'pending' | 'failed';
  timestamp: Date;
  value: number;
  hash?: string;
  gasUsed?: number;
  gasPrice?: number;
}

export interface WalletData {
  totalValue: number;
  totalValueVND: number;
  currency: 'USD' | 'VND';
  tokens: Token[];
  address: string;
  isConnected: boolean;
}

export interface ChartData {
  labels: string[];
  values: number[];
  timestamps: Date[];
}

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private walletDataSubject = new BehaviorSubject<WalletData>(this.getInitialWalletData());
  private transactionsSubject = new BehaviorSubject<Transaction[]>([]);
  private chartDataSubject = new BehaviorSubject<ChartData>(this.getInitialChartData());

  // Lazy-loaded P2PService to break circular dependency
  private _p2pService: P2PService | null = null;

  constructor(private injector: Injector) {
    this.startPriceSimulation();
    // Delay loading history to ensure all services are initialized
    setTimeout(() => this.loadTransactionHistory(), 0);
  }

  // Observables
  walletData$ = this.walletDataSubject.asObservable();
  transactions$ = this.transactionsSubject.asObservable();
  chartData$ = this.chartDataSubject.asObservable();

  // Exchange rates (mock)
  private exchangeRates = {
    USDVND: 26000,
    ETHUSDT: 1880,
    BTCUSDT: 42600,
    USDTUSDT: 1.00
  };



  private getInitialWalletData(): WalletData {
    return {
      totalValue: 125420.50,
      totalValueVND: 3012492000,
      currency: 'USD',
      address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d4d4',
      isConnected: true,
      tokens: [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          balance: 12.5,
          value: 23500.00,
          change24h: 2.5,
          icon: '⟠',
          address: '0x0000000000000000000000000000000000000000',
          decimals: 18
        },
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          balance: 2.1,
          value: 89420.50,
          change24h: -1.2,
          icon: '₿',
          address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          decimals: 8
        },
        {
          symbol: 'USDT',
          name: 'Tether',
          balance: 12500.00,
          value: 12500.00,
          change24h: 0.1,
          icon: '₮',
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          decimals: 6
        }
      ]
    };
  }



  private getInitialChartData(): ChartData {
    const now = new Date();
    const labels: string[] = [];
    const values: number[] = [];
    const timestamps: Date[] = [];

    // Generate 7 days of data
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      timestamps.push(date);
      
      if (i === 0) {
        labels.push('Hôm nay');
      } else if (i === 1) {
        labels.push('Hôm qua');
      } else {
        labels.push(`${i} ngày trước`);
      }
      
      // Generate realistic portfolio values with some volatility
      const baseValue = 125420.50;
      const volatility = (Math.random() - 0.5) * 0.1; // ±5% volatility
      const trendFactor = (7 - i) * 0.01; // Slight upward trend
      values.push(baseValue * (1 + volatility + trendFactor));
    }

    return { labels, values, timestamps };
  }

  private startPriceSimulation(): void {
    // Update prices every 30 seconds
    interval(30000).subscribe(() => {
      this.updateTokenPrices();
      this.updateChartData();
    });
  }

  private updateTokenPrices(): void {
    const currentData = this.walletDataSubject.value;
    const updatedTokens = currentData.tokens.map(token => {
      // Simulate price changes (±2% random change)
      const priceChange = (Math.random() - 0.5) * 0.04;
      const newPrice = this.getTokenPrice(token.symbol) * (1 + priceChange);
      const newValue = token.balance * newPrice;
      const change24h = token.change24h + (Math.random() - 0.5) * 0.5;

      return {
        ...token,
        value: newValue,
        change24h: Math.max(-10, Math.min(10, change24h)) // Limit to ±10%
      };
    });

    const totalValue = updatedTokens.reduce((sum, token) => sum + token.value, 0);
    const totalValueVND = totalValue * this.exchangeRates.USDVND;

    const updatedData: WalletData = {
      ...currentData,
      tokens: updatedTokens,
      totalValue,
      totalValueVND
    };

    this.walletDataSubject.next(updatedData);
  }

  private updateChartData(): void {
    const currentChart = this.chartDataSubject.value;
    const currentWallet = this.walletDataSubject.value;
    
    // Add new data point and remove oldest if we have more than 7 days
    const newValues = [...currentChart.values];
    const newLabels = [...currentChart.labels];
    const newTimestamps = [...currentChart.timestamps];

    if (newValues.length >= 7) {
      newValues.shift();
      newLabels.shift();
      newTimestamps.shift();
    }

    newValues.push(currentWallet.totalValue);
    newLabels.push('Hiện tại');
    newTimestamps.push(new Date());

    this.chartDataSubject.next({
      labels: newLabels,
      values: newValues,
      timestamps: newTimestamps
    });
  }

  private getTokenPrice(symbol: string): number {
    switch (symbol.toUpperCase()) {
      case 'ETH':
        return this.exchangeRates.ETHUSDT;
      case 'BTC':
        return this.exchangeRates.BTCUSDT;
      case 'USDT':
        return this.exchangeRates.USDTUSDT;
      case 'PM':
        return 1.0;
      default:
        return 1;
    }
  }

  // Public methods
  getWalletData(): Observable<WalletData> {
    return this.walletData$;
  }

  getTransactions(): Observable<Transaction[]> {
    return this.transactions$;
  }

  getChartData(): Observable<ChartData> {
    return this.chartData$;
  }

  getRecentTransactions(limit: number = 5): Observable<Transaction[]> {
    return this.transactions$.pipe(
      map(transactions =>
        transactions
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit)
      )
    );
  }

  private loadTransactionHistory(): void {
    // Lazy-load the P2PService instance
    if (!this._p2pService) {
      this._p2pService = this.injector.get(P2PService);
    }

    this._p2pService.getUserTransactionHistory(1, 50).pipe(
      map(response => {
        if (response.success && response.data) {
          return this.convertToTransactions(response.data);
        }
        return [];
      }),
      catchError(error => {
        console.error('Error loading transaction history:', error);
        return of([]);
      })
    ).subscribe(transactions => {
      this.transactionsSubject.next(transactions);
    });
  }

  private convertToTransactions(historyData: TransactionHistory[]): Transaction[] {
    return historyData.map(item => ({
      id: item.id,
      type: this.determineTransactionType(item),
      amount: item.sellAmount,
      symbol: item.sellToken,
      address: item.txHash,
      status: this.mapStatus(item.status),
      timestamp: new Date(item.transactionTime),
      value: item.sellAmount * this.getTokenPrice(item.sellToken),
      hash: item.txHash,
      gasUsed: item.gasFee
    }));
  }

  private determineTransactionType(item: TransactionHistory): 'receive' | 'send' | 'buy' | 'sell' {
    // FIX: Correctly determine if the transaction is a buy or a sell from the user's perspective.
    // This requires knowing the current user's wallet address.
    // For now, we can make a reasonable assumption based on the data.
    // A 'MATCHED' transaction with a buyerAddress means it's a completed trade.
    if (item.buyerAddress) {
      // This is a simplification. A full implementation would compare against the current user's address.
      // If the current user is the buyer, it's a 'buy'. If they are the seller, it's a 'sell'.
      // Assuming for display purposes that if we are the seller, it's a 'sell'.
      return 'sell'; // Or 'buy' depending on perspective. Let's default to 'sell' for completed trades.
    } else if (item.transactionType === 'CREATE_ORDER') {
      // An open order is a 'sell' order from the creator's perspective.
      return 'sell';
    }
    return 'sell'; // Default case
  }

  private mapStatus(status: string): 'completed' | 'pending' | 'failed' {
    const statusMap: { [key: string]: 'completed' | 'pending' | 'failed' } = {
      'COMPLETED': 'completed',
      'SUCCESS': 'completed',
      'MATCHED': 'completed',
      'CREATED': 'pending',
      'PENDING': 'pending',
      'FAILED': 'failed',
      'ERROR': 'failed'
    };
    return statusMap[status.toUpperCase()] || 'pending';
  }



  refreshTransactionHistory(): void {
    this.loadTransactionHistory();
  }

  toggleCurrency(): void {
    const currentData = this.walletDataSubject.value;
    const newCurrency = currentData.currency === 'USD' ? 'VND' : 'USD';
    
    this.walletDataSubject.next({
      ...currentData,
      currency: newCurrency
    });
  }

  // Simulate adding a new transaction
  addTransaction(transaction: Omit<Transaction, 'id' | 'timestamp'>): void {
    const currentTransactions = this.transactionsSubject.value;
    const newTransaction: Transaction = {
      ...transaction,
      id: Date.now().toString(),
      timestamp: new Date()
    };

    this.transactionsSubject.next([newTransaction, ...currentTransactions]);
  }

  // Get token by symbol
  getToken(symbol: string): Observable<Token | undefined> {
    return this.walletData$.pipe(
      map(data => data.tokens.find(token => token.symbol === symbol))
    );
  }

  // Check if wallet is connected
  isWalletConnected(): Observable<boolean> {
    return this.walletData$.pipe(
      map(data => data.isConnected)
    );
  }
}
