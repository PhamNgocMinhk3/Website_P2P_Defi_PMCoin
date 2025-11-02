import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  walletCode?: string;
  avatar?: string | null; // Allow null for users without an avatar
  bio?: string;
  createdAt: string;
  updatedAt?: string;
  role?: string; // Add role for compatibility
  isOnline?: boolean;
  lastSeen?: Date;
  showOnlineStatus?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  timestamp: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: User;
  expiresAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly API_URL = 'http://localhost:5000/api/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private authCheckCompleted = new BehaviorSubject<boolean>(false);

  public currentUser$ = this.currentUserSubject.asObservable();
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  public authCheckCompleted$ = this.authCheckCompleted.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.checkAuthStatus();
  }

  public checkAuthStatus(): void {
    // Only check auth status in browser environment
    if (!isPlatformBrowser(this.platformId)) {
      this.authCheckCompleted.next(true);
      return;
    }

    // Check if sessionId cookie exists by calling /api/userprofile/profile
    // The cookie will be sent automatically by the browser
    this.getCurrentUser().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.setCurrentUser(response.data);
        } else {
          this.clearAuthData();
        }
        this.authCheckCompleted.next(true);
      },
      error: (error) => {
        // Don't log 401 errors during auth check - this is expected when not logged in
        if (error.status !== 401) {
          console.error('🔧 Auth check error:', error);
        }
        this.clearAuthData();
        this.authCheckCompleted.next(true);
      },
    });
  }

  login(credentials: LoginRequest): Observable<ApiResponse<AuthResponse>> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${this.API_URL}/login`, credentials, {
        withCredentials: true, // Important for cookies
      })
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.handleAuthSuccess(response.data);
          }
        }),
        catchError(this.handleError)
      );
  }

  register(userData: RegisterRequest): Observable<ApiResponse<User>> {
    return this.http
      .post<ApiResponse<User>>(`${this.API_URL}/register`, userData)
      .pipe(catchError(this.handleError));
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.API_URL}/forgot-password`, request)
      .pipe(catchError(this.handleError));
  }

  resetPassword(request: ResetPasswordRequest): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.API_URL}/reset-password`, request)
      .pipe(catchError(this.handleError));
  }

  verifyEmail(token: string, email: string): Observable<ApiResponse> {
    return this.http
      .get<ApiResponse>(
        `${this.API_URL}/verify-email?token=${token}&email=${encodeURIComponent(
          email
        )}`
      )
      .pipe(catchError(this.handleError));
  }

  getCurrentUser(): Observable<ApiResponse<User>> {
    // This endpoint should return the full User object, including the ID.
    // The backend controller for this route is likely AuthController.GetCurrentUser or similar.
    // We are assuming it returns an object that matches the `User` interface.
    return this.http
      .get<ApiResponse<User>>(`${this.API_URL}/me`, {
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  refreshToken(): Observable<ApiResponse<AuthResponse>> {
    return this.http
      .post<ApiResponse<AuthResponse>>(
        `${this.API_URL}/refresh`,
        {},
        {
          withCredentials: true,
        }
      )
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.handleAuthSuccess(response.data);
          }
        }),
        catchError(this.handleError)
      );
  }

  logout(): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(
        `${this.API_URL}/logout`,
        {},
        {
          withCredentials: true,
        }
      )
      .pipe(
        tap(() => {
          this.clearAuthData();
          this.router.navigate(['/home']);
        }),
        catchError(this.handleError)
      );
  }

  getJwtToken(): Observable<string | null> {
    // This endpoint should return a short-lived JWT for SignalR.
    return this.http.get<ApiResponse<{ token: string }>>(`${this.API_URL}/get-token`, { withCredentials: true }).pipe(
      map(response => response.success ? response.data!.token : null),
      catchError(() => of(null)) // Return null if there's an error
    );
  }
  private handleAuthSuccess(authData: AuthResponse): void {
    // Backend handles session via HttpOnly cookies automatically
    // No need to store anything in localStorage

    // Update subjects
    this.setCurrentUser(authData.user);
  }

  private setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
    this.isAuthenticatedSubject.next(true);
  }

  private clearAuthData(): void {
    // Backend will clear HttpOnly cookies automatically on logout
    // No need to clear localStorage
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  private setCookie(name: string, value: string, minutes: number): void {
    if (isPlatformBrowser(this.platformId)) {
      const expires = new Date();
      expires.setTime(expires.getTime() + minutes * 60 * 1000);
      document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    }
  }

  private deleteCookie(name: string): void {
    if (isPlatformBrowser(this.platformId)) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }
  }

  private getCookie(name: string): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    console.error('🔧 HTTP Error Details:', error);

    // For HTTP errors, preserve the original error structure
    // so components can access detailed error information
    if (error.status >= 400 && error.status < 500) {
      // Client errors (400-499) - return the original error
      return throwError(() => error);
    }

    // For other errors, create a simplified error object
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else if (error.status === 0) {
      errorMessage = 'Unable to connect to server';
    } else if (error.status) {
      errorMessage = `Server error: ${error.status}`;
    } else {
      errorMessage = `Network error: ${error.message || 'Unknown error'}`;
    }

    return throwError(() => new Error(errorMessage));
  }

  // Utility methods
  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  hasRole(role: string): boolean {
    const user = this.currentUser;
    return user ? user.role === role : false;
  }

  isAdmin(): boolean {
    return this.hasRole('Admin');
  }

  isUser(): boolean {
    return this.hasRole('User');
  }
}
