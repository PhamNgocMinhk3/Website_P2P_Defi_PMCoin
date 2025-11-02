import {
  Component,
  OnInit,
  Inject,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  Injector,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subject, filter, switchMap, startWith } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  WalletService,
  WalletData,
  Transaction,
  ChartData,
} from '../../core/services/wallet.service';
import { AuthService, User } from '../../core/services/auth.service';
import { WalletOverviewComponent } from './components/wallet-overview/wallet-overview.component';
import { TransactionHistoryComponent } from './components/transaction-history/transaction-history.component';
import {
  QuickActionsComponent,
  QuickAction,
} from './components/quick-actions/quick-actions.component';
import { MarketOverviewComponent } from './components/market-overview/market-overview.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    QuickActionsComponent,
    MarketOverviewComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('dashboardContainer', { static: false })
  dashboardContainer!: ElementRef;

  private destroy$ = new Subject<void>();

  // Data from services
  // walletData?: WalletData;
  // recentTransactions?: Transaction[];
  // chartData?: ChartData;

  // User data from AuthService
  user = {
    name: 'Loading...',
    avatar:
      'https://i.pinimg.com/236x/5e/e0/82/5ee082781b8c41406a2a50a0f32d6aa6.jpg',
    email: 'loading@example.com',
  };

  // Services will be manually retrieved from the injector to avoid constructor DI issues.
  // private walletService!: WalletService;
  private authService!: AuthService;
  private router!: Router;

  constructor(
    private injector: Injector
  ) {}

  ngOnInit(): void {
    // FIX: Manually get services from the injector inside ngOnInit.
    // This is a robust way to ensure services are available before they are used,
    // avoiding the "Cannot read properties of undefined" error caused by complex DI cycles.
    // this.walletService = this.injector.get(WalletService);
    this.authService = this.injector.get(AuthService);
    this.router = this.injector.get(Router);
    this.loadData();
    this.initializeAnimations();
  }

  ngAfterViewInit(): void {
    this.setupScrollAnimations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeAnimations(): void {
    // Initialize GSAP animations for dashboard entrance
    if (typeof window !== 'undefined' && (window as any).gsap) {
      const gsap = (window as any).gsap;

      // Animate dashboard cards on load
      gsap.from('.dashboard-card', {
        duration: 0.8,
        y: 50,
        opacity: 0,
        stagger: 0.2,
        ease: 'power2.out',
      });
    }
  }

  private setupScrollAnimations(): void {
    // Setup scroll-triggered animations
    if (
      typeof window !== 'undefined' &&
      (window as any).gsap &&
      (window as any).ScrollTrigger
    ) {
      const gsap = (window as any).gsap;
      const ScrollTrigger = (window as any).ScrollTrigger;

      gsap.registerPlugin(ScrollTrigger);

      // Animate cards on scroll
      gsap.utils
        .toArray('.dashboard-card')
        .forEach((card: any, index: number) => {
          gsap.fromTo(
            card,
            {
              opacity: 0,
              y: 50,
            },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              delay: index * 0.1,
              scrollTrigger: {
                trigger: card,
                start: 'top 80%',
                end: 'bottom 20%',
                toggleActions: 'play none none reverse',
              },
            }
          );
        });
    }
  }

  // Utility methods (moved to individual components)

  // Quick action handler
  onQuickActionClick(action: QuickAction): void {
    // Quick action clicked

    switch (action.action) {
      case 'openChat':
        this.onOpenChat();
        break;
      case 'createTransaction':
        this.onCreateTransaction();
        break;
      case 'playGame':
        this.onPlayGame();
        break;
      case 'viewAnalysis':
        this.onViewAnalysis();
        break;
      case 'openSettings':
        this.onOpenSettings();
        break;
      default:
      // Unknown action
    }
  }

  // Quick action methods
  private onOpenChat(): void {
    // Navigate to chat
    this.router.navigate(['/chat']);
  }

  private onCreateTransaction(): void {
    // Navigate to create transaction
    // TODO: Navigate to P2P trading page
  }

  private onPlayGame(): void {
    // Navigate to mini game
    // TODO: Navigate to mini game page
  }

  private onViewAnalysis(): void {
    // Navigate to bot analysis
    // TODO: Navigate to bot analysis page
  }

  private onOpenSettings(): void {
    // Navigate to settings
    // TODO: Navigate to settings page
  }

  private loadData(): void {
    // Load wallet data
    // this.walletService
    //   .getWalletData()
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe((data) => {
    //     this.walletData = data;
    //   });

    // Load recent transactions
    // this.walletService
    //   .getRecentTransactions(5)
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe((transactions) => {
    //     this.recentTransactions = transactions;
    //   });

    // Load chart data
    // this.walletService
    //   .getChartData()
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe((data) => {
    //     this.chartData = data;
    //   });

    // Load user data from AuthService
    // FINAL FIX: Directly subscribe to currentUser$. Use startWith to get the initial value (which might be null)
    // and then filter to only proceed when a valid User object is emitted. This is the most robust way
    // to handle the race condition, as it doesn't depend on the timing of another observable.
    this.authService.currentUser$.pipe(
      startWith(this.authService.currentUser), // Immediately get the current value
      filter((user): user is User => user !== null), // Ensure the user data is not null
      takeUntil(this.destroy$)
    ).subscribe((user: User) => {
      this.user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      this.user.avatar = user.avatar || 'https://i.pinimg.com/236x/5e/e0/82/5ee082781b8c41406a2a50a0f32d6aa6.jpg';
      this.user.email = user.email;
    });
  }

  // Toggle currency display
  toggleCurrency(): void {
    // this.walletService.toggleCurrency();
  }

  // Chart utility methods
  // getMaxValue(): number {
  //   return this.chartData?.values ? Math.max(...this.chartData.values) : 0;
  // }

  // getMinValue(): number {
  //   return this.chartData?.values ? Math.min(...this.chartData.values) : 0;
  // }

  // getChangePercentage(): number {
  //   if (!this.chartData?.values || this.chartData.values.length < 2) {
  //     return 0;
  //   }
  //   const firstValue = this.chartData.values[0];
  //   const lastValue = this.chartData.values[this.chartData.values.length - 1];
  //   return ((lastValue - firstValue) / firstValue) * 100;
  // }
}
