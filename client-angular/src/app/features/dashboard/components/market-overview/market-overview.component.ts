import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BinanceApiService, MarketAnalysis } from '../../../../core/services/binance-api.service';

@Component({
  selector: 'app-market-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './market-overview.component.html',
  styleUrls: ['./market-overview.component.scss']
})
export class MarketOverviewComponent implements OnInit, OnDestroy {
  marketData: MarketAnalysis[] = [];
  private destroy$ = new Subject<void>();

  constructor(private binanceApiService: BinanceApiService) {}

  ngOnInit(): void {
    this.binanceApiService.marketData$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.marketData = data;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}