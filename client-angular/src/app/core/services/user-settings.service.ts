import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../client-angular/src/environments/environment';

// Mirror the DTO from the backend
export interface UserSettingsDto {
  twoFactorEnabled: boolean;
  loginNotificationEnabled: boolean;
  passwordChangeNotificationEnabled: boolean;
  emailNotificationEnabled: boolean;
  pushNotificationEnabled: boolean;
  smsNotificationEnabled: boolean;
  marketingEmailEnabled: boolean;
  profileVisibilityPublic: boolean;
  showOnlineStatus: boolean;
  allowDirectMessages: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class UserSettingsService {
  private apiUrl = `${environment.apiUrl}/api/userprofile`;

  constructor(private http: HttpClient) { }

  getSettings(): Observable<UserSettingsDto> {
    return this.http.get<ApiResponse<UserSettingsDto>>(`${this.apiUrl}/settings`).pipe(
      map(response => response.data)
    );
  }

  toggleEmailNotifications(): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/toggle-email-notifications`, {});
  }
}
