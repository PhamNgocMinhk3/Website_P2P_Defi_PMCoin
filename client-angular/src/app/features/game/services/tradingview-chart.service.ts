import { Injectable } from '@angular/core';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, ColorType, LineSeries } from 'lightweight-charts';

export interface TradingViewCandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradingViewLineData {
  time: Time;
  value: number;
}

@Injectable({
  providedIn: 'root'
})
export class TradingViewChartService {
  private chart: IChartApi | null = null;
  private candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  private lineSeries: ISeriesApi<'Line'> | null = null;
  private container: HTMLElement | null = null;
  private chartType: 'candlestick' | 'line' = 'line'; // Default to line for UP/DOWN game

  constructor() {}

  /**
   * Initialize TradingView chart
   */
  initializeChart(container: HTMLElement): IChartApi {
    this.container = container;
    
    // Create chart with professional trading theme
    this.chart = createChart(container, {
      layout: {
        background: {
          type: ColorType.Solid,
          color: 'transparent'
        },
        textColor: '#d1d4dc',
        fontSize: 12,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
      } as any,
      grid: {
        vertLines: {
          color: 'rgba(128, 128, 128, 0.1)', // Đổi từ xanh tím sang xám
          style: 1,
          visible: true
        },
        horzLines: {
          color: 'rgba(128, 128, 128, 0.1)', // Đổi từ xanh tím sang xám
          style: 1,
          visible: true
        }
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: {
          color: 'rgba(255, 255, 255, 0.8)', // Đổi sang trắng
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: 'rgba(64, 64, 64, 0.9)' // Nền xám đậm
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.8)', // Đổi sang trắng
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: 'rgba(64, 64, 64, 0.9)' // Nền xám đậm
        }
      },
      rightPriceScale: {
        borderColor: 'rgba(102, 126, 234, 0.3)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1
        }
      },
      timeScale: {
        borderColor: 'rgba(102, 126, 234, 0.3)',
        timeVisible: true,
        secondsVisible: true, // 🎯 FIXED: Show seconds for better time resolution
        rightOffset: 12,
        barSpacing: 12, // 🎯 FIXED: Wider spacing for better candle visibility
        minBarSpacing: 6 // 🎯 FIXED: Minimum spacing to prevent thin candles
      },

      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    });

    // Create line series for UP/DOWN game - simple and clean
    this.lineSeries = this.chart.addSeries(LineSeries, {
      color: '#00d4aa', // Bright teal for the line
      lineWidth: 3,
      lineStyle: 0, // Solid line
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBorderColor: '#00d4aa',
      crosshairMarkerBackgroundColor: '#00d4aa',
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001
      },
      lastValueVisible: true,
      priceLineVisible: true
    });

    // Handle chart resize
    this.setupResizeObserver();

    return this.chart;
  }

  /**
   * Set candlestick data
   */
  setCandlestickData(data: TradingViewCandleData[]): void {
    if (!this.candlestickSeries) {

      return;
    }

    // Sort data by time to ensure proper order
    const sortedData = data.sort((a, b) => (a.time as number) - (b.time as number));
    

    this.candlestickSeries.setData(sortedData);
    
    // Fit content to show all data
    if (this.chart) {
      this.chart.timeScale().fitContent();
    }
  }

  /**
   * Update with new real-time candle
   */
  updateRealTimeCandle(candle: TradingViewCandleData): void {
    if (!this.candlestickSeries) {

      return;
    }

    try {

      this.candlestickSeries.update(candle);
    } catch (error) {

      // If update fails, try adding as new candle
      try {
        this.candlestickSeries.update(candle);
      } catch (secondError) {

      }
    }
  }

  /**
   * Add new candle (for completed candles)
   */
  addNewCandle(candle: TradingViewCandleData): void {
    if (!this.candlestickSeries) {

      return;
    }


    this.candlestickSeries.update(candle);
  }

  /**
   * Setup resize observer for responsive chart
   */
  private setupResizeObserver(): void {
    if (!this.container || !this.chart) return;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== this.container) return;
      
      const { width, height } = entries[0].contentRect;
      this.chart?.applyOptions({ 
        width: width, 
        height: height 
      });
    });

    resizeObserver.observe(this.container);
  }

  /**
   * Destroy chart and cleanup
   */
  destroy(): void {
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
    this.candlestickSeries = null;
    this.lineSeries = null;
    this.container = null;
  }

  /**
   * Get chart instance (for advanced usage)
   */
  getChart(): IChartApi | null {
    return this.chart;
  }

  /**
   * Get candlestick series (for advanced usage)
   */
  getCandlestickSeries(): ISeriesApi<'Candlestick'> | null {
    return this.candlestickSeries;
  }

  /**
   * Get line series (for line chart)
   */
  getLineSeries(): ISeriesApi<'Line'> | null {
    return this.lineSeries;
  }

  /**
   * Set line chart data
   */
  setLineData(data: TradingViewLineData[]): void {
    if (!this.lineSeries) {

      return;
    }


    this.lineSeries.setData(data);
  }

  /**
   * Update real-time line data point
   */
  updateRealTimeLineData(point: TradingViewLineData): void {
    if (!this.lineSeries) {

      return;
    }

    try {

      this.lineSeries.update(point);
    } catch (error) {

    }
  }
}
