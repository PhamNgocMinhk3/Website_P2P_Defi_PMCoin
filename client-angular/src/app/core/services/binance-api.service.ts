import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, interval, Subscription, forkJoin, of } from 'rxjs';
import { map, catchError, takeUntil, switchMap } from 'rxjs/operators';
import { Subject } from 'rxjs';

export interface BinanceTickerData {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  count: number;
}

export interface BinanceKlineData {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
}

export interface MarketAnalysis {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  volume24h: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  support: number;
  resistance: number;
  rsi: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root',
})
export class BinanceApiService implements OnDestroy {
  // FIX: Use the correct proxy path for Binance API, consistent with BinanceDataService
  private readonly baseUrl = '/binance-api/api/v3';
  private readonly symbols = [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT'
  ];

  private marketDataSubject = new BehaviorSubject<MarketAnalysis[]>([]);
  public marketData$ = this.marketDataSubject.asObservable();

  private destroy$ = new Subject<void>();
  private updateSubscription?: Subscription;

  constructor(private http: HttpClient) {
    this.startRealTimeUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.updateSubscription) {
      this.updateSubscription.unsubscribe();
    }
  }

  // Get 24hr ticker statistics for all symbols
  getTicker24hr(symbol?: string): Observable<BinanceTickerData[]> { // FIX: Remove baseUrl to use relative path consistent with proxy
    const endpoint = symbol
      ? `/ticker/24hr?symbol=${symbol}`
      : `/ticker/24hr`;
    const url = `${this.baseUrl}${endpoint}`;

    return this.http.get<BinanceTickerData | BinanceTickerData[]>(url).pipe(
      map(response => {
        return Array.isArray(response) ? response : [response];
      }),
      takeUntil(this.destroy$),
      catchError((error) => {
        console.error(`Lỗi khi lấy ticker 24 giờ cho ${symbol || 'tất cả'}:`, error);
        throw error; // Ném lại lỗi
      })
    );
  }

  // Get kline/candlestick data
  getKlines(
    symbol: string,
    interval: string = '1h',
    limit: number = 100
  ): Observable<BinanceKlineData[]> {
    const url = `${this.baseUrl}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    return this.http.get<any[]>(url).pipe(
      takeUntil(this.destroy$),
      map((data) =>
        data.map((kline) => ({
          openTime: kline[0],
          open: kline[1],
          high: kline[2],
          low: kline[3],
          close: kline[4],
          volume: kline[5],
          closeTime: kline[6],
          quoteAssetVolume: kline[7],
          numberOfTrades: kline[8],
          takerBuyBaseAssetVolume: kline[9],
          takerBuyQuoteAssetVolume: kline[10],
        }))
      ),
      catchError((error) => {
        throw error; // Re-throw the error
      })
    );
  }

  // Get current price for a symbol
  getCurrentPrice(
    symbol: string
  ): Observable<{ symbol: string; price: string }> {
    const url = `${this.baseUrl}/ticker/price?symbol=${symbol}`;

    return this.http.get<{ symbol: string; price: string }>(url).pipe(
      takeUntil(this.destroy$),
      catchError((error) => {
        throw error; // Re-throw the error
      })
    );
  }

  // Analyze market data and generate trading signals
  analyzeMarket(symbol: string): Observable<MarketAnalysis> {
    // Refactored to use RxJS's forkJoin for parallel requests
    return forkJoin({
      tickerData: this.getTicker24hr(symbol),
      klineData: this.getKlines(symbol, '1h', 50),
    }).pipe(
      map(({ tickerData, klineData }) => {
        if (tickerData && tickerData.length > 0 && klineData && klineData.length > 0) {
          const ticker = tickerData[0];
          return this.performTechnicalAnalysis(ticker, klineData);
        } else {
          // Throw an error or return a specific object if data is incomplete
          throw new Error(`Incomplete data for symbol ${symbol}`);
        }
      }),
      catchError(error => {
        console.error(`Error in analyzeMarket for ${symbol}:`, error);
        // Return an empty observable to prevent the stream from breaking
        return of(null);
      })
    ) as Observable<MarketAnalysis>; // Cast to ensure type correctness, filtering nulls later
  }

  private performTechnicalAnalysis(
    ticker: BinanceTickerData,
    klines: BinanceKlineData[]
  ): MarketAnalysis {
    const currentPrice = parseFloat(ticker.lastPrice);
    const priceChange = parseFloat(ticker.priceChange);
    const priceChangePercent = parseFloat(ticker.priceChangePercent);
    const volume = parseFloat(ticker.volume);

    // Calculate RSI (simplified)
    const closes = klines.map((k) => parseFloat(k.close));
    const rsi = this.calculateRSI(closes);

    // Calculate support and resistance
    const highs = klines.map((k) => parseFloat(k.high));
    const lows = klines.map((k) => parseFloat(k.low));
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    // Determine trend
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

    if (currentPrice > sma20 && sma20 > sma50) {
      trend = 'BULLISH';
    } else if (currentPrice < sma20 && sma20 < sma50) {
      trend = 'BEARISH';
    }

    // Generate recommendation
    let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 50;

    if (trend === 'BULLISH' && rsi < 70 && priceChangePercent > 0) {
      recommendation = 'BUY';
      confidence = Math.min(85, 60 + Math.abs(priceChangePercent));
    } else if (trend === 'BEARISH' && rsi > 30 && priceChangePercent < 0) {
      recommendation = 'SELL';
      confidence = Math.min(85, 60 + Math.abs(priceChangePercent));
    }

    return {
      symbol: ticker.symbol,
      currentPrice,
      priceChange24h: priceChange,
      priceChangePercent24h: priceChangePercent,
      volume24h: volume,
      trend,
      support,
      resistance,
      rsi,
      recommendation,
      confidence,
      timestamp: new Date(),
    };
  }

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;

    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private startRealTimeUpdates(): void {
    // Update market data every 3 seconds for real-time experience
    this.updateSubscription = interval(10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateAllMarketData();
      });

    // Initial load
    this.updateAllMarketData();
  }

  private updateAllMarketData(): void {
    // Refactored to use RxJS's forkJoin
    const analysisObservables = this.symbols.map(symbol => this.analyzeMarket(symbol));

    forkJoin(analysisObservables).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (results) => {
        // Filter out any null results from failed API calls
        const successfulAnalyses = results.filter((analysis): analysis is MarketAnalysis => analysis !== null);
        if (successfulAnalyses.length > 0) {
          this.marketDataSubject.next(successfulAnalyses);
        }
      },
      error: (error) => {
        console.error("Lỗi nghiêm trọng khi cập nhật tất cả dữ liệu thị trường:", error);
      }
    });
  }

  // Force immediate update - public method for components
  forceUpdate(): void {
    this.updateAllMarketData();
  }}

  
