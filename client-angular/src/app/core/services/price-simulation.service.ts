import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';

export interface PMCoinData {
  currentPrice: number;
  previousPrice: number;
  change24h: number;
  volume: number;
  totalSupply: number;
  timestamp: Date;
  priceHistory: number[];
}

export interface SimulatedTransaction {
  id: string;
  user: string;
  walletAddress: string;
  action: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: Date;
}

export interface CandlestickData {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

@Injectable({
  providedIn: 'root'
})
export class PriceSimulationService {
  private readonly TOTAL_SUPPLY = 10_000_000;
  private readonly INITIAL_PRICE = 1.00;
  
  private pmCoinDataSubject = new BehaviorSubject<PMCoinData>(this.getInitialData());
  private transactionsSubject = new BehaviorSubject<SimulatedTransaction[]>([]);
  private candlestickSubject = new BehaviorSubject<CandlestickData[]>([]);
  
  // Observables
  pmCoinData$ = this.pmCoinDataSubject.asObservable();
  transactions$ = this.transactionsSubject.asObservable();
  candlestick$ = this.candlestickSubject.asObservable();
  
  private priceUpdateInterval?: any;
  private transactionInterval?: any;
  
  constructor() {
    this.startSimulation();
  }
  
  private getInitialData(): PMCoinData {
    return {
      currentPrice: this.INITIAL_PRICE,
      previousPrice: this.INITIAL_PRICE,
      change24h: 0,
      volume: 0,
      totalSupply: this.TOTAL_SUPPLY,
      timestamp: new Date(),
      priceHistory: [this.INITIAL_PRICE]
    };
  }
  
  private startSimulation(): void {
    // Update price every 1-3 seconds
    this.priceUpdateInterval = setInterval(() => {
      this.generateRandomTransaction();
    }, Math.random() * 2000 + 1000);
    
    // Generate candlestick data every 5 seconds
    this.transactionInterval = setInterval(() => {
      this.updateCandlestickData();
    }, 5000);
  }
  
  private generateRandomTransaction(): void {
    const currentData = this.pmCoinDataSubject.value;
    const transactions = this.transactionsSubject.value;
    
    // Generate random transaction
    const action: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';
    const amount = Math.floor(Math.random() * 4990) + 10; // 10-5000 coins
    const user = this.generateRandomUser();
    
    const transaction: SimulatedTransaction = {
      id: Date.now().toString(),
      user,
      walletAddress: this.generateRandomWallet(),
      action,
      amount,
      price: currentData.currentPrice,
      timestamp: new Date()
    };
    
    // Calculate new price based on transaction
    const priceImpact = (amount / this.TOTAL_SUPPLY) * (action === 'buy' ? 1 : -1);
    const volatility = (Math.random() - 0.5) * 0.02; // ±1% random volatility
    const newPrice = Math.max(0.01, currentData.currentPrice + priceImpact + volatility);
    
    // Update PM Coin data
    const updatedData: PMCoinData = {
      ...currentData,
      previousPrice: currentData.currentPrice,
      currentPrice: newPrice,
      change24h: ((newPrice - this.INITIAL_PRICE) / this.INITIAL_PRICE) * 100,
      volume: currentData.volume + amount,
      timestamp: new Date(),
      priceHistory: [...currentData.priceHistory.slice(-99), newPrice] // Keep last 100 prices
    };
    
    // Update subjects
    this.pmCoinDataSubject.next(updatedData);
    
    // Add transaction to history (keep last 20)
    const updatedTransactions = [transaction, ...transactions.slice(0, 19)];
    this.transactionsSubject.next(updatedTransactions);
  }
  
  private updateCandlestickData(): void {
    const currentData = this.pmCoinDataSubject.value;
    const candlesticks = this.candlestickSubject.value;
    const priceHistory = currentData.priceHistory;
    
    if (priceHistory.length < 2) return;
    
    // Get recent prices for candlestick
    const recentPrices = priceHistory.slice(-10); // Last 10 prices
    const open = recentPrices[0];
    const close = recentPrices[recentPrices.length - 1];
    const high = Math.max(...recentPrices);
    const low = Math.min(...recentPrices);
    const volume = Math.random() * 1000 + 100;
    
    const newCandle: CandlestickData = {
      time: new Date(),
      open,
      high,
      low,
      close,
      volume
    };
    
    // Keep last 50 candlesticks
    const updatedCandlesticks = [...candlesticks.slice(-49), newCandle];
    this.candlestickSubject.next(updatedCandlesticks);
  }
  
  private generateRandomUser(): string {
    const prefixes = ['User', 'Trader', 'Investor', 'Player'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = Math.random().toString(36).substring(2, 6);
    return `${prefix}_${suffix}`;
  }

  private generateRandomWallet(): string {
    const chars = '0123456789abcdef';
    let wallet = '0x';
    for (let i = 0; i < 40; i++) {
      wallet += chars[Math.floor(Math.random() * chars.length)];
    }
    return wallet;
  }
  
  // Public methods
  getCurrentData(): PMCoinData {
    return this.pmCoinDataSubject.value;
  }
  
  getRecentTransactions(): SimulatedTransaction[] {
    return this.transactionsSubject.value;
  }
  
  getCandlestickData(): CandlestickData[] {
    return this.candlestickSubject.value;
  }
  
  stopSimulation(): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    if (this.transactionInterval) {
      clearInterval(this.transactionInterval);
    }
  }
  
  restartSimulation(): void {
    this.stopSimulation();
    this.startSimulation();
  }
}
