import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ProcessedCandle } from './binance-data.service';

export interface TradingSignal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  timestamp: Date;
  reason: string;
  status: 'active' | 'completed' | 'stopped';
  indicators: {
    rsi: number;
    macd: number;
    sma20: number;
    sma50: number;
    volume: number;
  };
}

export interface MarketPrediction {
  direction: 'UP' | 'DOWN';
  confidence: number;
  timeframe: '1m' | '5m' | '15m';
  factors: string[];
  probability: number;
}

@Injectable({
  providedIn: 'root',
})
export class TradingLogicService {
  private signalSubject = new BehaviorSubject<TradingSignal | null>(null);
  private predictionSubject = new BehaviorSubject<MarketPrediction | null>(
    null
  );

  // Technical indicators cache
  private candleHistory: ProcessedCandle[] = [];
  private rsiPeriod = 14;
  private smaPeriod20 = 20;
  private smaPeriod50 = 50;

  constructor() {}

  get currentSignal$(): Observable<TradingSignal | null> {
    return this.signalSubject.asObservable();
  }

  get currentPrediction$(): Observable<MarketPrediction | null> {
    return this.predictionSubject.asObservable();
  }

  // Cập nhật dữ liệu nến mới
  updateCandleData(candles: ProcessedCandle[]): void {
    this.candleHistory = candles.slice(-100); // Giữ 100 nến gần nhất

    if (this.candleHistory.length >= 50) {
      this.analyzeMarket();
      this.generatePrediction();
    }
  }

  // Phân tích thị trường và tạo tín hiệu
  private analyzeMarket(): void {
    const latest = this.candleHistory[this.candleHistory.length - 1];
    const indicators = this.calculateIndicators();

    // Logic phân tích đa chỉ báo
    const signals = this.evaluateSignals(indicators, latest);

    if (signals.strength >= 0.7) {
      // Chỉ tạo tín hiệu khi độ tin cậy >= 70%
      const signal: TradingSignal = {
        id: Date.now().toString(),
        symbol: 'BTC/USDT',
        direction: signals.direction,
        entryPrice: latest.close,
        targetPrice: this.calculateTarget(latest.close, signals.direction),
        stopLoss: this.calculateStopLoss(latest.close, signals.direction),
        confidence: signals.strength * 100,
        timestamp: new Date(),
        reason: signals.reason,
        status: 'active',
        indicators: indicators,
      };

      this.signalSubject.next(signal);
    }
  }

  // Tạo dự đoán cho game
  private generatePrediction(): void {
    const indicators = this.calculateIndicators();
    const latest = this.candleHistory[this.candleHistory.length - 1];

    // Logic dự đoán cho game (ngắn hạn)
    const prediction = this.predictShortTerm(indicators, latest);
    this.predictionSubject.next(prediction);
  }

  // Tính toán các chỉ báo kỹ thuật
  private calculateIndicators(): any {
    const closes = this.candleHistory.map((c) => c.close);
    const volumes = this.candleHistory.map((c) => c.volume);
    const highs = this.candleHistory.map((c) => c.high);
    const lows = this.candleHistory.map((c) => c.low);

    return {
      rsi: this.calculateRSI(closes),
      macd: this.calculateMACD(closes),
      sma20: this.calculateSMA(closes, 20),
      sma50: this.calculateSMA(closes, 50),
      volume: this.calculateVolumeIndicator(volumes),
      bollinger: this.calculateBollingerBands(closes),
      stochastic: this.calculateStochastic(highs, lows, closes),
      momentum: this.calculateMomentum(closes),
    };
  }

  // RSI (Relative Strength Index)
  private calculateRSI(prices: number[]): number {
    if (prices.length < this.rsiPeriod + 1) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const avgGain =
      gains.slice(-this.rsiPeriod).reduce((a, b) => a + b, 0) / this.rsiPeriod;
    const avgLoss =
      losses.slice(-this.rsiPeriod).reduce((a, b) => a + b, 0) / this.rsiPeriod;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  // MACD (Moving Average Convergence Divergence)
  private calculateMACD(prices: number[]): number {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    return ema12 - ema26;
  }

  // EMA (Exponential Moving Average)
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * multiplier + ema * (1 - multiplier);
    }

    return ema;
  }

  // SMA (Simple Moving Average)
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    const recent = prices.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / period;
  }

  // Volume Indicator
  private calculateVolumeIndicator(volumes: number[]): number {
    const recent = volumes.slice(-20);
    const avgVolume = recent.reduce((a, b) => a + b, 0) / recent.length;
    const currentVolume = volumes[volumes.length - 1];
    return currentVolume / avgVolume; // Volume ratio
  }

  // Bollinger Bands
  private calculateBollingerBands(prices: number[]): {
    upper: number;
    middle: number;
    lower: number;
  } {
    const sma = this.calculateSMA(prices, 20);
    const recent = prices.slice(-20);
    const variance =
      recent.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);

    return {
      upper: sma + stdDev * 2,
      middle: sma,
      lower: sma - stdDev * 2,
    };
  }

  // Stochastic Oscillator
  private calculateStochastic(
    highs: number[],
    lows: number[],
    closes: number[]
  ): number {
    const period = 14;
    if (highs.length < period) return 50;

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];

    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);

    return ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  }

  // Momentum
  private calculateMomentum(prices: number[]): number {
    const period = 10;
    if (prices.length < period) return 0;

    const current = prices[prices.length - 1];
    const past = prices[prices.length - period];
    return ((current - past) / past) * 100;
  }

  // Đánh giá tín hiệu từ các chỉ báo
  private evaluateSignals(
    indicators: any,
    latest: ProcessedCandle
  ): { direction: 'LONG' | 'SHORT'; strength: number; reason: string } {
    let bullishScore = 0;
    let bearishScore = 0;
    const reasons: string[] = [];

    // RSI Analysis
    if (indicators.rsi < 30) {
      bullishScore += 0.3;
      reasons.push('RSI oversold');
    } else if (indicators.rsi > 70) {
      bearishScore += 0.3;
      reasons.push('RSI overbought');
    }

    // MACD Analysis
    if (indicators.macd > 0) {
      bullishScore += 0.2;
      reasons.push('MACD bullish');
    } else {
      bearishScore += 0.2;
      reasons.push('MACD bearish');
    }

    // Moving Average Analysis
    if (
      latest.close > indicators.sma20 &&
      indicators.sma20 > indicators.sma50
    ) {
      bullishScore += 0.25;
      reasons.push('Price above MA20 > MA50');
    } else if (
      latest.close < indicators.sma20 &&
      indicators.sma20 < indicators.sma50
    ) {
      bearishScore += 0.25;
      reasons.push('Price below MA20 < MA50');
    }

    // Volume Analysis
    if (indicators.volume > 1.5) {
      if (bullishScore > bearishScore) {
        bullishScore += 0.15;
        reasons.push('High volume confirms bullish');
      } else {
        bearishScore += 0.15;
        reasons.push('High volume confirms bearish');
      }
    }

    // Bollinger Bands
    if (latest.close < indicators.bollinger.lower) {
      bullishScore += 0.2;
      reasons.push('Price below lower Bollinger');
    } else if (latest.close > indicators.bollinger.upper) {
      bearishScore += 0.2;
      reasons.push('Price above upper Bollinger');
    }

    const direction = bullishScore > bearishScore ? 'LONG' : 'SHORT';
    const strength = Math.max(bullishScore, bearishScore);

    return {
      direction,
      strength: Math.min(strength, 1),
      reason: reasons.join(', '),
    };
  }

  // Dự đoán ngắn hạn cho game
  private predictShortTerm(
    indicators: any,
    latest: ProcessedCandle
  ): MarketPrediction {
    let upProbability = 0.5;
    const factors: string[] = [];

    // Quick momentum check
    if (indicators.momentum > 0) {
      upProbability += 0.15;
      factors.push('Positive momentum');
    } else {
      upProbability -= 0.15;
      factors.push('Negative momentum');
    }

    // RSI quick check
    if (indicators.rsi < 40) {
      upProbability += 0.1;
      factors.push('RSI suggests bounce');
    } else if (indicators.rsi > 60) {
      upProbability -= 0.1;
      factors.push('RSI suggests pullback');
    }

    // Volume confirmation
    if (indicators.volume > 1.2) {
      factors.push('Volume confirms direction');
      if (upProbability > 0.5) {
        upProbability += 0.05;
      } else {
        upProbability -= 0.05;
      }
    }

    // Stochastic
    if (indicators.stochastic < 20) {
      upProbability += 0.1;
      factors.push('Stochastic oversold');
    } else if (indicators.stochastic > 80) {
      upProbability -= 0.1;
      factors.push('Stochastic overbought');
    }

    upProbability = Math.max(0.1, Math.min(0.9, upProbability));

    return {
      direction: upProbability > 0.5 ? 'UP' : 'DOWN',
      confidence: Math.abs(upProbability - 0.5) * 2,
      timeframe: '1m',
      factors,
      probability: upProbability > 0.5 ? upProbability : 1 - upProbability,
    };
  }

  // Tính target price
  private calculateTarget(
    entryPrice: number,
    direction: 'LONG' | 'SHORT'
  ): number {
    const targetPercent = 0.02; // 2% target
    return direction === 'LONG'
      ? entryPrice * (1 + targetPercent)
      : entryPrice * (1 - targetPercent);
  }

  // Tính stop loss
  private calculateStopLoss(
    entryPrice: number,
    direction: 'LONG' | 'SHORT'
  ): number {
    const stopPercent = 0.01; // 1% stop loss
    return direction === 'LONG'
      ? entryPrice * (1 - stopPercent)
      : entryPrice * (1 + stopPercent);
  }

  // Public methods
  getCurrentSignal(): TradingSignal | null {
    return this.signalSubject.value;
  }

  getCurrentPrediction(): MarketPrediction | null {
    return this.predictionSubject.value;
  }

  // Simulate trading for demo
  simulateTrading(): {
    action: 'BUY' | 'SELL';
    confidence: number;
    reason: string;
  } {
    const prediction = this.getCurrentPrediction();
    if (!prediction) {
      return {
        action: Math.random() > 0.5 ? 'BUY' : 'SELL',
        confidence: 0.5,
        reason: 'Random simulation',
      };
    }

    return {
      action: prediction.direction === 'UP' ? 'BUY' : 'SELL',
      confidence: prediction.confidence,
      reason: prediction.factors.join(', '),
    };
  }
}
