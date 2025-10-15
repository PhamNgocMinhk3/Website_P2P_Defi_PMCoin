import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { tap, map } from 'rxjs/operators';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface UserSettings {
  pushNotificationEnabled: boolean;
  emailNotificationEnabled: boolean;
  loginNotificationEnabled: boolean;
  showOnlineStatus: boolean;
  twoFactorEnabled: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UserSettingsService {
  // FIX: Point to the correct API endpoint as defined in the backend UserProfileController.
  private apiUrl = `${environment.apiUrl}/api/userprofile/settings`;
  private settingsSubject = new BehaviorSubject<UserSettings | null>(null);
  public settings$ = this.settingsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUserSettings().subscribe();
  }

  public loadUserSettings(): Observable<UserSettings> {
    // FIX: The backend wraps the settings in an ApiResponse, so we need to map the response
    // to extract the 'data' property.
    return this.http.get<ApiResponse<UserSettings>>(this.apiUrl, { withCredentials: true }).pipe(
      map(response => response.data), // Extract the UserSettings object from the response
      tap(settings => this.settingsSubject.next(settings))
    );
  }

  public updateSettings(settings: Partial<UserSettings>): Observable<any> {
    return this.http.put(this.apiUrl, settings, { withCredentials: true }).pipe(
      tap(() => {
        // Optimistically update the local state
        const currentSettings = this.settingsSubject.getValue();
        const updatedSettings = { ...currentSettings, ...settings } as UserSettings;
        this.settingsSubject.next(updatedSettings);
      })
    );
  }

  public getCurrentSettings(): UserSettings | null {
    return this.settingsSubject.getValue();
  }
}