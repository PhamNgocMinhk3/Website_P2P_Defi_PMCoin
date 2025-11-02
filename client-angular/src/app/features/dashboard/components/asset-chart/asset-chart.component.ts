import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartData } from '../../../../core/services/wallet.service';

@Component({
  selector: 'app-asset-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asset-chart.component.html',
  styleUrls: ['./asset-chart.component.scss'],
})
export class AssetChartComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() chartData?: ChartData;
  @ViewChild('chartCanvas', { static: false })
  chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart?: any;
  private chartInstance?: any;
  selectedPeriod: '7D' | '30D' = '7D';

  constructor() {}

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    this.initChart();
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  private async initChart(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      // Dynamic import of Chart.js
      const { Chart, registerables } = await import('chart.js');
      Chart.register(...registerables);

      const ctx = this.chartCanvas.nativeElement.getContext('2d');
      if (!ctx || !this.chartData) {
        return;
      }

      // Create gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, 250);
      gradient.addColorStop(0, 'rgba(79, 70, 229, 0.3)');
      gradient.addColorStop(1, 'rgba(79, 70, 229, 0.05)');

      this.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: this.chartData.labels,
          datasets: [
            {
              label: 'Giá trị tài sản',
              data: this.chartData.values,
              borderColor: '#4F46E5',
              backgroundColor: gradient,
              borderWidth: 3,
              fill: true,
              tension: 0.4,
              pointBackgroundColor: '#4F46E5',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 6,
              pointHoverRadius: 8,
              pointHoverBackgroundColor: '#4F46E5',
              pointHoverBorderColor: '#ffffff',
              pointHoverBorderWidth: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index',
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: '#4F46E5',
              borderWidth: 1,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                title: (context: any) => {
                  return context[0].label;
                },
                label: (context: any) => {
                  return `Giá trị: ${this.formatCurrency(context.parsed.y)}`;
                },
              },
            },
          },
          scales: {
            x: {
              display: true,
              grid: {
                display: false,
              },
              ticks: {
                color: '#9CA3AF',
                font: {
                  size: 12,
                },
              },
            },
            y: {
              display: true,
              grid: {
                color: 'rgba(156, 163, 175, 0.1)',
              },
              ticks: {
                color: '#9CA3AF',
                font: {
                  size: 12,
                },
                callback: (value: any) => {
                  return this.formatCurrency(value, true);
                },
              },
            },
          },
          elements: {
            point: {
              hoverRadius: 8,
            },
          },
          animation: {
            duration: 1000,
            easing: 'easeInOutQuart',
          },
        },
      });

      // Add GSAP animation if available
      this.animateChart();
    } catch (error) {
      // Error initializing chart
    }
  }

  private animateChart(): void {
    if (
      typeof window !== 'undefined' &&
      (window as any).gsap &&
      this.chartInstance
    ) {
      const gsap = (window as any).gsap;

      // Animate chart appearance
      gsap.fromTo(
        this.chartCanvas.nativeElement,
        {
          opacity: 0,
          scale: 0.8,
        },
        {
          opacity: 1,
          scale: 1,
          duration: 0.8,
          ease: 'power2.out',
        }
      );
    }
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  onPeriodChange(period: '7D' | '30D'): void {
    this.selectedPeriod = period;
    // In a real app, this would trigger a data reload
    // For now, we'll just update the visual state
    this.updateChartAnimation();
  }

  private updateChartAnimation(): void {
    if (typeof window !== 'undefined' && (window as any).gsap) {
      const gsap = (window as any).gsap;

      // Animate period change
      gsap.to(this.chartCanvas.nativeElement, {
        scale: 0.95,
        duration: 0.1,
        yoyo: true,
        repeat: 1,
        ease: 'power2.inOut',
      });
    }
  }

  // Utility methods
  formatCurrency(value: number, short: boolean = false): string {
    if (short && value >= 1000) {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
      } else {
        return `$${(value / 1000).toFixed(1)}K`;
      }
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  getMaxValue(): number {
    return this.chartData?.values ? Math.max(...this.chartData.values) : 0;
  }

  getMinValue(): number {
    return this.chartData?.values ? Math.min(...this.chartData.values) : 0;
  }

  getChangePercentage(): number {
    if (!this.chartData?.values || this.chartData.values.length < 2) {
      return 0;
    }
    const firstValue = this.chartData.values[0];
    const lastValue = this.chartData.values[this.chartData.values.length - 1];
    return ((lastValue - firstValue) / firstValue) * 100;
  }
}
