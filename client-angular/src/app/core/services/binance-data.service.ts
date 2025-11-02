import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';

export interface CandlestickData {
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

export interface ProcessedCandle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerData {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root',
})
export class BinanceDataService {
  // Use the proxy path defined in proxy.conf.json
  private readonly BINANCE_API_BASE = '/binance-api/api/v3';
  private readonly BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

  // Subjects for real-time data
  private candlestickSubject = new BehaviorSubject<ProcessedCandle[]>([]);
  private tickerSubject = new BehaviorSubject<TickerData | null>(null);
  private connectionStatusSubject = new BehaviorSubject<boolean>(false);

  // WebSocket connection
  private websocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Fallback simulation
  private simulationInterval: any;
  private isSimulationMode = false;
  private lastPrice = 43000;

  constructor() {
    this.initializeConnection();
  }

  // Public observables
  get candlestickData$(): Observable<ProcessedCandle[]> {
    return this.candlestickSubject.asObservable();
  }

  get tickerData$(): Observable<TickerData | null> {
    return this.tickerSubject.asObservable();
  }

  get connectionStatus$(): Observable<boolean> {
    return this.connectionStatusSubject.asObservable();
  }

  private async initializeConnection(): Promise<void> {
    try {
      // First try to get historical data
      await this.loadHistoricalData('BTCUSDT', '1m', 50);

      // Then try to establish WebSocket connection
      this.connectWebSocket('BTCUSDT');

      // Fallback to simulation if WebSocket fails
      setTimeout(() => {
        if (!this.connectionStatusSubject.value) {
          // WebSocket connection failed, switching to simulation mode
          this.startSimulation();
        }
      }, 5000);
    } catch (error) {
      // Failed to initialize Binance connection
      this.startSimulation();
    }
  }

  private async loadHistoricalData(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<void> {
    try {
      const url = `${this.BINANCE_API_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: any[][] = await response.json();
      const processedData: ProcessedCandle[] = data.map((candle) => ({
        time: new Date(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));

      this.candlestickSubject.next(processedData);

      // Update ticker with latest data
      if (processedData.length > 0) {
        const latest = processedData[processedData.length - 1];
        const previous = processedData[processedData.length - 2];
        const change24h = previous
          ? ((latest.close - previous.close) / previous.close) * 100
          : 0;

        this.tickerSubject.next({
          symbol: symbol,
          price: latest.close,
          change24h: change24h,
          volume: latest.volume,
          timestamp: new Date(),
        });

        this.lastPrice = latest.close;
      }
    } catch (error) {
      // Error loading historical data
      throw error;
    }
  }

  private connectWebSocket(symbol: string): void {
    try {
      const wsUrl = `${this.BINANCE_WS_BASE}/${symbol.toLowerCase()}@kline_1m`;
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        // Binance WebSocket connected
        this.connectionStatusSubject.next(true);
        this.reconnectAttempts = 0;
        this.isSimulationMode = false;
        this.stopSimulation();
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          // Error parsing WebSocket message
        }
      };

      this.websocket.onclose = () => {
        // Binance WebSocket disconnected
        this.connectionStatusSubject.next(false);
        this.attemptReconnect(symbol);
      };

      this.websocket.onerror = () => {
        // Binance WebSocket error
        this.connectionStatusSubject.next(false);
      };
    } catch (error) {
      // Error creating WebSocket connection
      this.startSimulation();
    }
  }

  private handleWebSocketMessage(data: any): void {
    if (data.k) {
      // Kline data
      const kline = data.k;
      const newCandle: ProcessedCandle = {
        time: new Date(kline.t),
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
      };

      // Update candlestick data
      const currentData = this.candlestickSubject.value;
      const updatedData = [...currentData];

      if (kline.x) {
        // Kline is closed
        updatedData.push(newCandle);
        if (updatedData.length > 50) {
          updatedData.shift(); // Keep only last 50 candles
        }
      } else {
        // Update the last candle
        if (updatedData.length > 0) {
          updatedData[updatedData.length - 1] = newCandle;
        }
      }

      this.candlestickSubject.next(updatedData);

      // Update ticker data
      const previous =
        currentData.length > 1 ? currentData[currentData.length - 2] : null;
      const change24h = previous
        ? ((newCandle.close - previous.close) / previous.close) * 100
        : 0;

      this.tickerSubject.next({
        symbol: kline.s,
        price: newCandle.close,
        change24h: change24h,
        volume: newCandle.volume,
        timestamp: new Date(),
      });

      this.lastPrice = newCandle.close;
    }
  }

  private attemptReconnect(symbol: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      // Attempting to reconnect

      setTimeout(() => {
        this.connectWebSocket(symbol);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      // Max reconnection attempts reached, switching to simulation mode
      this.startSimulation();
    }
  }

  private startSimulation(): void {
    if (this.isSimulationMode) return;

    // Starting price simulation mode
    this.isSimulationMode = true;
    this.connectionStatusSubject.next(false);

    // Generate initial data if empty
    if (this.candlestickSubject.value.length === 0) {
      this.generateInitialSimulationData();
    }

    this.simulationInterval = setInterval(() => {
      this.generateSimulatedCandle();
    }, 3000); // Update every 3 seconds
  }

  private stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.isSimulationMode = false;
  }

  private generateInitialSimulationData(): void {
    const data: ProcessedCandle[] = [];
    let price = this.lastPrice;
    const now = new Date();

    for (let i = 49; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000); // 1 minute intervals
      const volatility = 0.02; // 2% volatility

      const change = (Math.random() - 0.5) * volatility;
      const open = price;
      const close = price * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);

      data.push({
        time,
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000 + 100,
      });

      price = close;
    }

    this.candlestickSubject.next(data);
    this.lastPrice = price;
  }

  private generateSimulatedCandle(): void {
    const currentData = this.candlestickSubject.value;
    const volatility = 0.015; // 1.5% volatility

    const change = (Math.random() - 0.5) * volatility;
    const open = this.lastPrice;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);

    const newCandle: ProcessedCandle = {
      time: new Date(),
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000 + 100,
    };

    const updatedData = [...currentData, newCandle];
    if (updatedData.length > 50) {
      updatedData.shift();
    }

    this.candlestickSubject.next(updatedData);

    // Update ticker
    const previous =
      currentData.length > 1 ? currentData[currentData.length - 2] : null;
    const change24h = previous
      ? ((close - previous.close) / previous.close) * 100
      : 0;

    this.tickerSubject.next({
      symbol: 'BTCUSDT',
      price: close,
      change24h: change24h,
      volume: newCandle.volume,
      timestamp: new Date(),
    });

    this.lastPrice = close;
  }

  // Public methods
  public getCurrentPrice(): number {
    return this.lastPrice;
  }

  public isConnected(): boolean {
    return this.connectionStatusSubject.value;
  }

  public isInSimulationMode(): boolean {
    return this.isSimulationMode;
  }

  public reconnect(): void {
    if (this.websocket) {
      this.websocket.close();
    }
    this.stopSimulation();
    this.reconnectAttempts = 0;
    this.initializeConnection();
  }

  public destroy(): void {
    if (this.websocket) {
      this.websocket.close();
    }
    this.stopSimulation();
  }
}
