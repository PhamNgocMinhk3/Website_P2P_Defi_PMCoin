import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface UserProfile {
  id: string; // Add id to ensure consistency
  username: string;
  email: string;
  role?: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  walletCode?: string;
  avatar?: string;
  bio?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UserSettings {
  // Security Settings
  twoFactorEnabled: boolean;
  loginNotificationEnabled: boolean;
  passwordChangeNotificationEnabled: boolean;

  // Notification Settings
  emailNotificationEnabled: boolean;
  pushNotificationEnabled: boolean;
  smsNotificationEnabled: boolean;
  marketingEmailEnabled: boolean;

  // Privacy Settings
  profileVisibilityPublic: boolean;
  showOnlineStatus: boolean;
  allowDirectMessages: boolean;
}

export interface UpdateUserProfile {
  phoneNumber?: string;
  walletCode?: string;
  bio?: string;
  firstName?: string;
  lastName?: string;
}

export interface ChangePassword {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message: string;
  errors?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private readonly userProfileApiUrl = `${environment.apiUrl}/api/userprofile`;
  private readonly otpApiUrl = `${environment.apiUrl}/api/otp`;

  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  public userProfile$ = this.userProfileSubject.asObservable();

  private userSettingsSubject = new BehaviorSubject<UserSettings | null>(null);
  public userSettings$ = this.userSettingsSubject.asObservable();

  constructor(private http: HttpClient) {}

  // The getAuthHeaders method is deprecated as we are using HttpOnly session cookies.
  // An AuthInterceptor will handle adding `withCredentials: true` globally.
  // For now, we add it to each request manually.

  // Profile methods
  getProfile(): Observable<ApiResponse<UserProfile>> {
    return this.http
      .get<ApiResponse<UserProfile>>(`${this.userProfileApiUrl}/profile`, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.userProfileSubject.next(response.data);
          }
        })
      );
  }

  updateProfile(
    updateData: UpdateUserProfile
  ): Observable<ApiResponse<UserProfile>> {
    return this.http
      .put<ApiResponse<UserProfile>>(`${this.userProfileApiUrl}/profile`, updateData, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.userProfileSubject.next(response.data);
          }
        })
      );
  }

  uploadAvatar(file: File): Observable<ApiResponse<string>> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ApiResponse<string>>(
      `${this.userProfileApiUrl}/avatar`,
      formData,
      {
        withCredentials: true, // Use session-based auth
      }
    );
  }

  // Settings methods
  getSettings(): Observable<ApiResponse<UserSettings>> {
    return this.http
      .get<ApiResponse<UserSettings>>(`${this.userProfileApiUrl}/settings`, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.userSettingsSubject.next(response.data);
          }
        })
      );
  }

  updateSettings(
    settings: UserSettings
  ): Observable<ApiResponse<UserSettings>> {
    return this.http
      .put<ApiResponse<UserSettings>>(`${this.userProfileApiUrl}/settings`, settings, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.userSettingsSubject.next(response.data);
          }
        })
      );
  }

  updatePresenceSetting(showOnlineStatus: boolean): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${this.userProfileApiUrl}/settings/presence`,
      { showOnlineStatus },
      {
        withCredentials: true,
      }
    );
  }

  // Password methods
  changePassword(
    passwordData: ChangePassword
  ): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(
      `${this.userProfileApiUrl}/change-password`,
      passwordData,
      {
        withCredentials: true, // Use session-based auth
      }
    );
  }

  // Export/Import methods
  exportSettings(): Observable<Blob> {
    return this.http.get(`${this.userProfileApiUrl}/export-settings`, {
      withCredentials: true,
      responseType: 'blob',
    });
  }

  importSettings(settingsData: any): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(
      `${this.userProfileApiUrl}/import-settings`,
      settingsData,
      {
        withCredentials: true, // Use session-based auth
      }
    );
  }

  // OTP Methods
  sendOtp(purpose: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.otpApiUrl}/send`, { purpose }, {
      withCredentials: true,
    });
  }

  verifyOtp(otp: string, purpose: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(
      `${this.otpApiUrl}/verify`,
      { otp, purpose },
      {
        withCredentials: true,
      }
    );
  }
  // Utility methods
  getCurrentProfile(): UserProfile | null {
    return this.userProfileSubject.value;
  }

  getCurrentSettings(): UserSettings | null {
    return this.userSettingsSubject.value;
  }

  clearCache(): void {
    this.userProfileSubject.next(null);
    this.userSettingsSubject.next(null);
  }
}
