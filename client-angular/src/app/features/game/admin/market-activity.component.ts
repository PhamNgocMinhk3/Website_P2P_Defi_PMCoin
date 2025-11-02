import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { GameService } from '../services/game.service';

interface MarketTransaction {
  id: string;
  walletAddress: string;
  action: 'BUY' | 'SELL';
  amount: number;
  price: number;
  timestamp: Date;
  impact: number;
}

interface CandlestickData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

@Component({
  selector: 'app-market-activity',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="market-activity">
      <!-- Header -->
      <div class="market-header">
        <div class="coin-info">
          <div class="coin-icon">PM</div>
          <div class="coin-details">
            <h2>PM Coin</h2>
            <span class="pair">PMC/USD</span>
            <div class="live-indicator">
              <span class="live-dot"></span>
              LIVE
            </div>
          </div>
        </div>
        <div class="price-info">
          <div class="current-price">\${{ formatPrice(currentPrice) }}</div>
          <div class="price-change" [class]="priceChangeClass">
            <span class="change-icon">{{ priceChangeIcon }}</span>
            {{ priceChangePercent }}%
          </div>
        </div>
      </div>

      <!-- Candlestick Chart -->
      <div class="chart-container">
        <canvas #chartCanvas class="price-chart"></canvas>
        <div class="chart-overlay">
          @if (showTooltip) {
          <div class="price-tooltip" [style.left.px]="tooltipX" [style.top.px]="tooltipY">
            <div class="tooltip-time">{{ tooltipData.time }}</div>
            <div class="tooltip-price">\${{ tooltipData.price }}</div>
          </div>
          }

          <!-- Auto-scroll indicator -->
          @if (!autoScroll && scrollOffset > 0) {
          <div class="scroll-indicator">
            <button class="return-to-live" (click)="returnToLatestCandles()">
              📊 Return to Live
            </button>
          </div>
          }
        </div>

      <!-- Market Activity Feed -->
      <div class="activity-section">
        <h3>📊 Hoạt Động Thị Trường</h3>
        <div class="activity-feed">
          @for (tx of recentTransactions; track tx.id) {
          <div class="activity-item"
               [class]="'activity-' + tx.action.toLowerCase()">
            <div class="activity-icon">
              <span class="action-dot" [class]="tx.action.toLowerCase()"></span>
            </div>
            <div class="activity-details">
              <div class="wallet-address">{{ formatWalletAddress(tx.walletAddress) }}</div>
              <div class="activity-meta">
                <span class="action">{{ tx.action === 'BUY' ? 'mua' : 'bán' }}</span>
                <span class="amount">{{ formatAmount(tx.amount) }} PMC</span>
              </div>
            </div>
            <div class="activity-price">
              <div class="price">\${{ formatPrice(tx.price) }}</div>
              <div class="time">{{ formatTime(tx.timestamp) }}</div>
            </div>
          </div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./market-activity.component.scss']
})
export class MarketActivityComponent implements OnInit, OnDestroy {
  @ViewChild('chartCanvas', { static: true }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  
  private subscriptions: Subscription[] = [];
  private ctx!: CanvasRenderingContext2D;
  private candlestickData: CandlestickData[] = [];

  // ABSOLUTE FIXED DIMENSIONS - NEVER CHANGE THESE
  private readonly candleWidth = 12; // Exactly 12px width
  private readonly candleSpacing = 16; // Exactly 16px between centers

  // Viewport and scrolling
  public scrollOffset = 0; // Number of candles scrolled from right (0 = showing latest)
  public autoScroll = true; // Auto-scroll to latest candle
  private animationFrameId: number | null = null;
  private userScrollTimeout: number | null = null; // Auto-return timer

  // Price and display - load from database
  currentPrice = 1.0000; // Will be loaded from database
  priceChangePercent = '+0.00';
  priceChangeClass = 'positive';
  priceChangeIcon = '↗';

  showTooltip = false;
  tooltipX = 0;
  tooltipY = 0;
  tooltipData = { time: '', price: '' };

  recentTransactions: MarketTransaction[] = [];

  // Chart interaction
  private isDragging = false;
  private lastMouseX = 0;
  private dragStartOffset = 0;

  constructor(private gameService: GameService) {}

  ngOnInit() {
    this.initializeChart();
    this.loadCurrentPrice(); // Load price from database first
    this.generateMockData();
    this.startRealTimeUpdates();

    // Ensure we start with auto-scroll enabled and showing latest candles
    this.autoScroll = true;
    this.scrollOffset = 0;

    console.log('📊 Market Activity Chart initialized - showing latest candles');
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Cancel any pending animation frames
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clear user scroll timeout
    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
      this.userScrollTimeout = null;
    }
  }

  private initializeChart() {
    const canvas = this.chartCanvas.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    // Set canvas size
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Add mouse events for scrolling
    this.setupChartInteraction(canvas);

    this.drawChart();
  }

  private setupChartInteraction(canvas: HTMLCanvasElement) {
    // PROFESSIONAL MOUSE WHEEL SCROLLING
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      // Override auto-scroll when user manually scrolls
      this.disableAutoScrollTemporarily();

      // Horizontal scrolling: wheel down = older (left), wheel up = newer (right)
      const scrollSensitivity = 2; // Candles per wheel tick
      const delta = e.deltaY > 0 ? scrollSensitivity : -scrollSensitivity;

      // Calculate max scroll (can't scroll past oldest candle)
      const maxVisibleCandles = Math.floor((canvas.offsetWidth - 80) / this.candleSpacing);
      const maxScroll = Math.max(0, this.candlestickData.length - maxVisibleCandles);

      this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + delta));

      // If scrolled back to latest position, re-enable auto-scroll
      if (this.scrollOffset === 0) {
        this.autoScroll = true;
      }

      this.requestSmoothRedraw();
    });

    // PROFESSIONAL CLICK-AND-DRAG SCROLLING
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.dragStartOffset = this.scrollOffset;
      this.disableAutoScrollTemporarily();

      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const deltaX = e.clientX - this.lastMouseX;

        // Convert pixel movement to candle scroll
        // Positive deltaX = drag right = scroll left (older candles)
        // Negative deltaX = drag left = scroll right (newer candles)
        const candlesDelta = Math.round(-deltaX / this.candleSpacing);

        const maxVisibleCandles = Math.floor((canvas.offsetWidth - 80) / this.candleSpacing);
        const maxScroll = Math.max(0, this.candlestickData.length - maxVisibleCandles);
        this.scrollOffset = Math.max(0, Math.min(maxScroll, this.dragStartOffset + candlesDelta));

        // If dragged back to latest position, re-enable auto-scroll
        if (this.scrollOffset === 0) {
          this.autoScroll = true;
        }

        this.requestSmoothRedraw();
      }
    });

    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      canvas.style.cursor = 'grab';
    });

    // Double-click to instantly return to latest candles
    canvas.addEventListener('dblclick', () => {
      this.returnToLatestCandles();
    });
  }

  // Temporarily disable auto-scroll with auto-return timer
  private disableAutoScrollTemporarily() {
    this.autoScroll = false;

    // Clear existing timer
    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
    }

    // Auto-return to latest after 30 seconds of inactivity
    this.userScrollTimeout = window.setTimeout(() => {
      if (!this.isDragging) {
        this.returnToLatestCandles();
      }
    }, 30000);
  }

  // Smooth return to latest candles (public for template access)
  public returnToLatestCandles() {
    this.autoScroll = true;
    this.scrollOffset = 0;

    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
      this.userScrollTimeout = null;
    }

    this.requestSmoothRedraw();
    console.log('📊 Returned to latest candles');
  }

  // SMOOTH 60FPS RENDERING
  private requestSmoothRedraw() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.drawChart();
      this.animationFrameId = null;
    });
  }

  private drawChart() {
    if (!this.ctx || this.candlestickData.length === 0) return;
    
    const canvas = this.chartCanvas.nativeElement;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    // Draw grid
    this.drawGrid(width, height);
    
    // Draw candlesticks
    this.drawCandlesticks(width, height);
  }

  private drawGrid(width: number, height: number) {
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Subtle grid lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;

    // Horizontal lines (price levels)
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(padding, y);
      this.ctx.lineTo(width - padding, y);
      this.ctx.stroke();
    }

    // Vertical lines (time intervals) - fewer lines for cleaner look
    const timeIntervals = 8;
    for (let i = 0; i <= timeIntervals; i++) {
      const x = padding + (chartWidth / timeIntervals) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, padding);
      this.ctx.lineTo(x, height - padding);
      this.ctx.stroke();
    }

    // Chart border
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(padding, padding, chartWidth, chartHeight);
  }

  private drawCandlesticks(width: number, height: number) {
    if (this.candlestickData.length === 0) return;

    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // PROFESSIONAL VIEWPORT SYSTEM
    const maxVisibleCandles = Math.floor(chartWidth / this.candleSpacing);
    const totalCandles = this.candlestickData.length;

    // CRITICAL FIX: Proper viewport calculation for latest-first display
    let startIndex: number;
    let endIndex: number;

    if (this.autoScroll && this.scrollOffset === 0) {
      // DEFAULT VIEW: Always show latest candles on the right
      endIndex = totalCandles;
      startIndex = Math.max(0, totalCandles - maxVisibleCandles);
    } else {
      // MANUAL SCROLL: Show historical data based on scroll offset
      endIndex = Math.max(maxVisibleCandles, totalCandles - this.scrollOffset);
      startIndex = Math.max(0, endIndex - maxVisibleCandles);
      endIndex = Math.min(totalCandles, endIndex);
    }

    // Get visible candles slice
    const visibleCandles = this.candlestickData.slice(startIndex, endIndex);
    if (visibleCandles.length === 0) return;

    // Calculate price range for visible candles only (prevents erratic price scale)
    const minPrice = Math.min(...visibleCandles.map(d => d.low));
    const maxPrice = Math.max(...visibleCandles.map(d => d.high));
    const priceRange = maxPrice - minPrice || 0.001;

    // FIXED POSITIONING: Each candle has absolute position
    visibleCandles.forEach((candle, visibleIndex) => {
      // CRITICAL: Fixed positioning - candle position never changes
      const x = padding + (visibleIndex * this.candleSpacing) + (this.candleSpacing - this.candleWidth) / 2;

      // Viewport clipping - only draw if within bounds
      if (x + this.candleWidth < padding || x > width - padding) return;

      // Calculate Y positions based on price range
      const openY = padding + chartHeight - ((candle.open - minPrice) / priceRange) * chartHeight;
      const closeY = padding + chartHeight - ((candle.close - minPrice) / priceRange) * chartHeight;
      const highY = padding + chartHeight - ((candle.high - minPrice) / priceRange) * chartHeight;
      const lowY = padding + chartHeight - ((candle.low - minPrice) / priceRange) * chartHeight;

      const isGreen = candle.close >= candle.open;
      const bodyHeight = Math.abs(closeY - openY);
      const bodyY = Math.min(openY, closeY);

      // Professional colors
      const greenColor = '#00ff88';
      const redColor = '#ff4757';
      const wickColor = isGreen ? '#00cc66' : '#cc3333';

      // Draw wick (high-low line)
      this.ctx.strokeStyle = wickColor;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x + this.candleWidth / 2, highY);
      this.ctx.lineTo(x + this.candleWidth / 2, lowY);
      this.ctx.stroke();

      // Draw candle body
      if (bodyHeight < 2) {
        // Doji candle - draw as horizontal line
        this.ctx.strokeStyle = isGreen ? greenColor : redColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x, openY);
        this.ctx.lineTo(x + this.candleWidth, openY);
        this.ctx.stroke();
      } else {
        // Normal candle body with fixed 12px width
        this.ctx.fillStyle = isGreen ? greenColor : redColor;
        this.ctx.fillRect(x, bodyY, this.candleWidth, bodyHeight);

        // Border for better definition
        this.ctx.strokeStyle = isGreen ? '#00aa55' : '#aa2222';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, bodyY, this.candleWidth, bodyHeight);
      }
    });

    // Draw price scale on right side
    this.drawPriceLabels(width, height, minPrice, maxPrice, padding);
  }

  private drawPriceLabels(width: number, height: number, minPrice: number, maxPrice: number, padding: number) {
    const priceRange = maxPrice - minPrice || 0.001;
    const chartHeight = height - padding * 2;

    // Draw 5 price levels
    for (let i = 0; i <= 4; i++) {
      const price = minPrice + (priceRange * i / 4);
      const y = padding + chartHeight - (i / 4) * chartHeight;

      // Price text
      this.ctx.fillStyle = '#888';
      this.ctx.font = '11px monospace';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`$${price.toFixed(4)}`, width - 60, y + 4);
    }
  }

  private generateMockData() {
    // Generate candlestick data
    let price = 1.0000;
    const now = Date.now();
    
    for (let i = 0; i < 50; i++) {
      const timestamp = now - (50 - i) * 60000; // 1 minute intervals
      const open = price;
      const change = (Math.random() - 0.5) * 0.02;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 0.01;
      const low = Math.min(open, close) - Math.random() * 0.01;
      
      this.candlestickData.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000000
      });
      
      price = close;
    }
    
    this.currentPrice = price;
    
    // Generate recent transactions
    this.generateRecentTransactions();
  }

  private generateRecentTransactions() {
    const wallets = [
      '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4',
      '0x8ba1f109551bD432803012645Hac189451b934',
      '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      '0xA0b86a33E6441E6C7D3b4c0532925a3b8D4C0532',
      '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      '0x514910771AF9Ca656af840dff83E8264EcF986CA'
    ];
    
    this.recentTransactions = [];
    
    for (let i = 0; i < 8; i++) {
      const wallet = wallets[Math.floor(Math.random() * wallets.length)];
      const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
      // Bot trading với volume lớn: 50M - 500M PMC
      const amount = Math.floor(Math.random() * 450000000) + 50000000;
      // Price impact lớn hơn với volume lớn: ±2-5%
      const priceImpact = (Math.random() - 0.5) * 0.05; // ±2.5%
      const price = this.currentPrice * (1 + priceImpact);
      
      this.recentTransactions.push({
        id: `tx_${i}`,
        walletAddress: wallet,
        action: action as 'BUY' | 'SELL',
        amount,
        price,
        timestamp: new Date(Date.now() - i * 30000),
        impact: (Math.random() - 0.5) * 0.02 // ±1% impact
      });
    }
  }

  private startRealTimeUpdates() {
    // Update transactions every 3 seconds
    const txSub = interval(3000).subscribe(() => {
      this.addNewTransaction();
    });
    this.subscriptions.push(txSub);

    // Update price every 2 seconds - smooth updates
    const priceSub = interval(2000).subscribe(() => {
      this.updatePrice();
    });
    this.subscriptions.push(priceSub);

    // Simulate bot trading impact every 5-10 seconds
    const botSub = interval(7000).subscribe(() => {
      this.simulateBotTradingImpact();
    });
    this.subscriptions.push(botSub);
  }

  private simulateBotTradingImpact() {
    // Simulate realistic bot trading impact với volume lớn
    const isBuy = Math.random() > 0.5;
    const baseImpact = isBuy ? 0.015 : -0.015; // 1.5% base impact (tăng từ 0.3%)
    const randomFactor = (Math.random() - 0.5) * 0.01; // Additional randomness

    // Apply price impact với multiplicative change
    const priceMultiplier = 1 + baseImpact + randomFactor;
    this.currentPrice = Math.max(0.01, this.currentPrice * priceMultiplier);

    // Add bot transaction to activity feed
    this.addBotTransaction(isBuy ? 'BUY' : 'SELL');

    // **CRITICAL**: Update database price để sync với P2P và game
    this.gameService.updatePMCoinPrice(
      this.currentPrice,
      'BOT_TRADING',
      `Bot ${isBuy ? 'BUY' : 'SELL'} impact: ${(baseImpact * 100).toFixed(1)}%`
    ).subscribe({
      next: (response) => {
        console.log(`🤖 Bot ${isBuy ? 'BUY' : 'SELL'} - Price: $${this.currentPrice.toFixed(4)} - Updated in DB`);
      },
      error: (error) => {
        console.error('❌ Failed to update bot trading price:', error);
      }
    });

    // Update only the current candle - historical data remains untouched
    this.updateLatestCandle();
  }

  private addBotTransaction(action: 'BUY' | 'SELL') {
    const botWallets = [
      '0x1234...5678', '0xabcd...efgh', '0x9876...5432',
      '0xdef0...1234', '0x5678...9abc'
    ];

    const newTx: MarketTransaction = {
      id: `bot_${Date.now()}_${Math.random()}`,
      walletAddress: botWallets[Math.floor(Math.random() * botWallets.length)],
      action: action,
      amount: Math.floor(Math.random() * 450000000) + 50000000, // 50M-500M PMC
      price: this.currentPrice,
      timestamp: new Date(),
      impact: action === 'BUY' ? 0.015 : -0.015 // ±1.5% impact
    };

    this.recentTransactions.unshift(newTx);
    if (this.recentTransactions.length > 8) {
      this.recentTransactions.pop();
    }
  }

  private addNewTransaction() {
    const wallets = [
      '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4',
      '0x8ba1f109551bD432803012645Hac189451b934',
      '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      '0xA0b86a33E6441E6C7D3b4c0532925a3b8D4C0532'
    ];
    
    const wallet = wallets[Math.floor(Math.random() * wallets.length)];
    const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
    const amount = Math.floor(Math.random() * 10000) + 100;
    const price = this.currentPrice + (Math.random() - 0.5) * 0.01;
    
    const newTx: MarketTransaction = {
      id: `tx_${Date.now()}`,
      walletAddress: wallet,
      action: action as 'BUY' | 'SELL',
      amount,
      price,
      timestamp: new Date(),
      impact: (Math.random() - 0.5) * 0.001
    };
    
    this.recentTransactions.unshift(newTx);
    if (this.recentTransactions.length > 8) {
      this.recentTransactions.pop();
    }
  }

  private updatePrice() {
    // Generate realistic price movement với bot trading impact
    const volatility = 0.02; // 2% max change per update (tăng từ 0.5%)
    const change = (Math.random() - 0.5) * volatility;
    const oldPrice = this.currentPrice;

    // Update current price với minimum $0.01
    this.currentPrice = Math.max(0.01, this.currentPrice * (1 + change));

    // Update price display
    const changePercent = ((this.currentPrice - oldPrice) / oldPrice) * 100;
    this.priceChangePercent = (changePercent >= 0 ? '+' : '') + changePercent.toFixed(2);
    this.priceChangeClass = changePercent >= 0 ? 'positive' : 'negative';
    this.priceChangeIcon = changePercent >= 0 ? '↗' : '↘';

    // **CRITICAL**: Update database price để sync với P2P và game
    if (Math.abs(changePercent) > 0.5) { // Only update if significant change (>0.5%)
      this.gameService.updatePMCoinPrice(
        this.currentPrice,
        'MARKET_ACTIVITY',
        `Price movement: ${changePercent.toFixed(2)}%`
      ).subscribe({
        next: (response) => {
          // console.log('💾 PM Coin price updated in database:', this.currentPrice); // Tắt log
        },
        error: (error) => {
          // console.error('❌ Failed to update PM Coin price:', error); // Tắt log
        }
      });
    }

    // CRITICAL: Only update latest candle - historical data stays immutable
    this.updateLatestCandle();
  }

  private updateLatestCandle() {
    if (this.candlestickData.length === 0) {
      this.addNewCandle();
      return;
    }

    // IMMUTABLE HISTORICAL DATA: Only update the rightmost (current) candle
    const lastCandle = this.candlestickData[this.candlestickData.length - 1];
    const now = Date.now();
    const candleAgeMinutes = (now - lastCandle.timestamp) / 60000;

    // Create new candle every 60 seconds (1 minute intervals)
    if (candleAgeMinutes >= 1.0) {
      this.addNewCandle();

      // CRITICAL: Ensure auto-scroll follows new candles smoothly
      if (this.autoScroll) {
        this.scrollOffset = 0; // Always show latest when auto-scrolling
        console.log('📊 New candle created - auto-scrolling to latest');
      }
    } else {
      // ONLY update current candle's OHLC - historical candles NEVER change
      lastCandle.close = this.currentPrice;
      lastCandle.high = Math.max(lastCandle.high, this.currentPrice);
      lastCandle.low = Math.min(lastCandle.low, this.currentPrice);
      lastCandle.volume += Math.random() * 100; // Simulate volume increment
    }

    // Smooth redraw only if auto-scrolling or updating current candle
    if (this.autoScroll || candleAgeMinutes < 1.0) {
      this.requestSmoothRedraw();
    }
  }

  private addNewCandle() {
    const now = Date.now();

    // Create new candle with current price as OHLC starting point
    const newCandle: CandlestickData = {
      timestamp: now,
      open: this.currentPrice,
      high: this.currentPrice,
      low: this.currentPrice,
      close: this.currentPrice,
      volume: Math.random() * 500 + 100
    };

    // APPEND to right side - historical data remains immutable
    this.candlestickData.push(newCandle);

    // Maintain performance by keeping reasonable history
    const maxHistoryCandles = 500; // Keep 500 candles max
    if (this.candlestickData.length > maxHistoryCandles) {
      // Remove oldest candles but keep the array structure intact
      const removedCount = this.candlestickData.length - maxHistoryCandles;
      this.candlestickData = this.candlestickData.slice(-maxHistoryCandles);

      // Adjust scroll offset if we removed candles from the beginning
      if (!this.autoScroll) {
        this.scrollOffset = Math.max(0, this.scrollOffset - removedCount);
      }
    }

    console.log(`📊 New candle created. Total: ${this.candlestickData.length}, Auto-scroll: ${this.autoScroll}`);
  }

  formatWalletAddress(address: string): string {
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

  // Load current price from database
  public loadCurrentPrice(): void {
    this.gameService.getCurrentPMCoinPrice().subscribe({
      next: (priceData) => {
        this.currentPrice = priceData.price || 1.0000;
        console.log('💰 Loaded current PM Coin price from database:', this.currentPrice);

        // Update price display
        this.priceChangePercent = '+0.00';
        this.priceChangeClass = 'positive';
        this.priceChangeIcon = '↗';
      },
      error: (error) => {
        console.error('❌ Failed to load current price:', error);
        this.currentPrice = 1.0000; // Fallback
      }
    });
  }

  formatPrice(price: number): string {
    if (price >= 1) {
      return price.toFixed(2);
    } else if (price >= 0.01) {
      return price.toFixed(4);
    } else if (price >= 0.001) {
      return price.toFixed(5);
    } else {
      return price.toFixed(8); // Show more decimals for very small prices
    }
  }

  formatTime(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }

  // trackByTxId removed - using Angular 17+ @for with track
}
