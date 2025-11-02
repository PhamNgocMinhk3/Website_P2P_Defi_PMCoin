import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { MainMenuComponent } from './shared/components/main-menu/main-menu.component';
import { NotificationComponent } from './shared/components/notification/notification.component';
import { ThemeService } from './shared/services/theme.service';
import { NotificationService } from './shared/services/notification.service'; // Import NotificationService
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { filter, takeUntil } from 'rxjs/operators';
import { GameHubService } from './services/game-hub.service'; // Import GameHubService
import { Subscription, Subject } from 'rxjs'; // Import Subscription

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MainMenuComponent,
    NotificationComponent,
    CommonModule,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
// Sửa lỗi 2: Đổi tên class từ AppComponent thành App
export class App implements OnInit, OnDestroy { // Implement OnDestroy
  title = 'client-angular';
  isAuthPage = false;
  isHomePage = false;
  isDashboardPage = false;

  private authRoutes = ['/login', '/register', '/forgot-password'];
  private destroy$ = new Subject<void>();

  constructor(
    private themeService: ThemeService,
    private router: Router,
    private gameHubService: GameHubService,
    private notificationService: NotificationService, // Inject NotificationService
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.themeService.loadTheme();

    // Check initial route
    this.checkRoutes(this.router.url);

    // Listen for route changes
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        this.checkRoutes(event.url);
      });

    // Start SignalR connection only in the browser
    if (isPlatformBrowser(this.platformId)) {
      this.gameHubService.startConnection();
    }
  }

  ngOnDestroy() {
    // Stop SignalR connection when component is destroyed, only in the browser
    if (isPlatformBrowser(this.platformId)) {
      this.gameHubService.stopConnection();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkRoutes(url: string) {
    // Clean the URL to handle query parameters and fragments
    const cleanUrl = url.split('?')[0].split('#')[0];

    this.isAuthPage = this.authRoutes.some((route) => cleanUrl === route);
    this.isHomePage = cleanUrl === '/' || cleanUrl === '/home';
    this.isDashboardPage = cleanUrl === '/dashboard';
  }
}
