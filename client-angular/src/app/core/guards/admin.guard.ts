import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { switchMap, take, filter, delay } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    // For debug mode, allow access (check if window exists for SSR)
    if (typeof window !== 'undefined' && window.location.pathname.includes('/debug')) {
      return of(true);
    }

    // Wait for auth check to complete (filter ensures we only proceed when true)
    return this.authService.authCheckCompleted$.pipe(
      filter(completed => completed === true), // Only proceed when auth check is completed
      take(1),
      delay(100), // Small delay to ensure auth state is fully updated
      switchMap(() => this.checkAdminAccess())
    );
  }

  private checkAdminAccess(): Observable<boolean> {
    // Check if user is authenticated and has Admin role
    if (this.authService.isAuthenticated && this.authService.isAdmin()) {
      return of(true);
    }

    // If not authenticated, redirect to login
    if (!this.authService.isAuthenticated) {
      this.router.navigate(['/login']);
      return of(false);
    }

    // If authenticated but not admin, redirect to home with error
    this.router.navigate(['/'], {
      queryParams: { error: 'Access denied. Admin privileges required.' }
    });
    return of(false);
  }
}
