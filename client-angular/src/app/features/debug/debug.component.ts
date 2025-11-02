import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-debug',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; font-family: monospace;">
      <h2>🔍 Debug User Info</h2>
      
      <div style="background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px;">
        <h3>Authentication Status:</h3>
        <p><strong>Is Authenticated:</strong> {{ authService.isAuthenticated }}</p>
        <p><strong>Is Admin:</strong> {{ authService.isAdmin() }}</p>
        <p><strong>Is User:</strong> {{ authService.isUser() }}</p>
      </div>

      <div style="background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px;">
        <h3>Current User:</h3>
        <pre>{{ getCurrentUserJson() }}</pre>
      </div>

      <div style="background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px;">
        <h3>LocalStorage Data:</h3>
        <p><strong>Token:</strong> {{ getToken() ? 'Present' : 'Missing' }}</p>
        <p><strong>Current User:</strong> {{ getStoredUser() ? 'Present' : 'Missing' }}</p>
      </div>

      @if (authService.isAuthenticated && !authService.isAdmin()) {
        <div style="background: #ffe6e6; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #ff9999;">
          <h3>❌ Admin Access Issue:</h3>
          <p>You are logged in but don't have Admin role.</p>
          <p>Current role: <strong>{{ authService.currentUser?.role || 'No role' }}</strong></p>
          <p>Need to update database to set role = 'Admin'</p>
        </div>
      }

      @if (!authService.isAuthenticated) {
        <div style="background: #ffe6e6; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #ff9999;">
          <h3>❌ Not Authenticated:</h3>
          <p>Please login first</p>
        </div>
      }

      @if (authService.isAdmin()) {
        <div style="background: #e6ffe6; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #99ff99;">
          <h3>✅ Admin Access Available:</h3>
          <p>You can access the admin dashboard</p>
          <a href="/admin/manager-game-hub" style="color: blue; text-decoration: underline;">
            Go to Admin Dashboard
          </a>
        </div>
      }

      <div style="background: #fff3cd; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #ffeaa7;">
        <h3>🔧 API Test:</h3>
        <button (click)="testProfileAPI()" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
          Test Profile API
        </button>
        @if (apiTestResult) {
          <pre style="margin-top: 10px; background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto;">{{ apiTestResult }}</pre>
        }
      </div>
    </div>
  `
})
export class DebugComponent {
  apiTestResult: string = '';

  constructor(
    public authService: AuthService,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  getCurrentUserJson(): string {
    return JSON.stringify(this.authService.currentUser, null, 2);
  }

  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('token');
    }
    return null;
  }

  getStoredUser(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('currentUser');
    }
    return null;
  }

  testProfileAPI(): void {
    this.apiTestResult = 'Testing...';

    this.http.get<any>('http://localhost:5000/api/userprofile/profile', {
      withCredentials: true
    }).subscribe({
      next: (response) => {
        this.apiTestResult = `✅ SUCCESS:\n${JSON.stringify(response, null, 2)}`;
      },
      error: (error) => {
        this.apiTestResult = `❌ ERROR:\nStatus: ${error.status}\nMessage: ${error.message}\nResponse: ${JSON.stringify(error.error, null, 2)}`;
      }
    });
  }
}
