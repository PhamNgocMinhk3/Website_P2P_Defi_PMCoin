import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, finalize } from 'rxjs';
import { AvatarManagementComponent } from './components/avatar-management/avatar-management.component';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  UserProfileService,
  UserProfile,
  UpdateUserProfile,
  ChangePassword,
} from '../../core/services/user-profile.service'; // Keep for profile management
import { UserSettingsService, UserSettings } from '../../shared/services/user-settings.service'; // Import the correct service for settings
import { NotificationService } from '../../shared/services/notification.service';
import { AuthService } from '../../core/services/auth.service';

interface LocalUserProfile {
  email: string;
  fullName: string;
  phone: string; // This is the phone number
  walletCode: string; // This is the wallet address
  avatar: string;
}

interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarManagementComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, AfterViewInit, OnDestroy {
  private destroy$ = new Subject<void>();
  activeTab: 'profile' | 'security' | 'notifications' = 'profile';

  // Loading states
  isSaving = false;

  // User profile data
  userProfile: LocalUserProfile = {
    email: '',
    fullName: '',
    phone: '',
    walletCode: '',
    avatar: '👤',
  };

  // Backend data
  backendProfile: UserProfile | null = null;
  userSettings: UserSettings | null = null;

  // Password change form
  passwordForm: PasswordChangeForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

  // Messages
  successMessage = '';
  errorMessage = '';

  // Form states
  isEditingProfile = false;
  isChangingPassword = false;

  constructor(
    private userProfileService: UserProfileService,
    private userSettingsService: UserSettingsService, // Inject the new service
    private notificationService: NotificationService, 
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Wait for auth check to complete before loading data
    this.authService.authCheckCompleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((completed) => {
        if (completed) {
          if (!this.authService.isAuthenticated) {
            this.router.navigate(['/login']);
            return;
          }
          this.userProfileService.userProfile$
            .pipe(takeUntil(this.destroy$))
            .subscribe((profile) => {
              if (profile) {
                this.backendProfile = profile;
                this.mapBackendProfileToLocal(profile);
              }
            });
          // Subscribe to settings changes from UserSettingsService
          this.userSettingsService.settings$.pipe(takeUntil(this.destroy$)).subscribe(settings => this.userSettings = settings);
          // Initial data fetch
          this.fetchInitialData();
        }
      });
  }

  ngAfterViewInit(): void {
    this.setupAnimations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchInitialData(): void {
    this.userProfileService.getProfile().subscribe({
      error: (err) => this.handleLoadError(err, 'profile'),
    });
    // FIX: Load settings from the correct service
    this.userSettingsService.loadUserSettings().subscribe({
      error: (err) => this.handleLoadError(err, 'settings'),
    });
  }

  // Map backend profile to local interface
  private mapBackendProfileToLocal(profile: UserProfile): void {
    this.userProfile = {
      email: profile.email || '',
      fullName: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
      phone: profile.phoneNumber || '',
      walletCode: profile.walletCode || '',
      avatar:
        profile.avatar ||
        'https://i.pinimg.com/236x/5e/e0/82/5ee082781b8c41406a2a50a0f32d6aa6.jpg',
    };
  }

  private setupAnimations(): void {
    if (typeof window !== 'undefined' && (window as any).gsap) {
      const gsap = (window as any).gsap;

      // Animate settings interface
      gsap.fromTo(
        '.settings-interface',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }
      );
    }
  }

  // Tab management
  setActiveTab(tab: 'profile' | 'security' | 'notifications'): void {
    this.activeTab = tab;

    // Animate tab change
    if (typeof window !== 'undefined' && (window as any).gsap) {
      const gsap = (window as any).gsap;

      gsap.fromTo(
        '.tab-content',
        { opacity: 0, x: 20 },
        { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }
      );
    }
  }

  // Profile methods
  toggleEditProfile(): void {
    this.isEditingProfile = !this.isEditingProfile;
  }

  saveProfile(): void {
    if (!this.backendProfile) return;

    this.isSaving = true;

    const updateData: UpdateUserProfile = {
      phoneNumber: this.userProfile.phone || undefined,
      walletCode: this.userProfile.walletCode || undefined,
      firstName: this.userProfile.fullName.split(' ')[0] || '',
      lastName: this.userProfile.fullName.split(' ').slice(1).join(' ') || '',
    };

    this.userProfileService
      .updateProfile(updateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.showSuccess('Profile đã được cập nhật thành công!');
            this.isEditingProfile = false;
            // The new profile is already pushed to the service's BehaviorSubject,
            // and our component subscription will automatically update the UI.
            // No need to manually update `this.backendProfile` or `this.userProfile`.
          } else {
            this.showError(
              response.message || 'Có lỗi xảy ra khi cập nhật profile'
            );
          }
          this.isSaving = false;
        },
        error: (error) => {
          console.error('Error updating profile:', error);
          this.showError('Không thể cập nhật profile');
          this.isSaving = false;
        },
      });
  }

  cancelEditProfile(): void {
    this.isEditingProfile = false;
    // Revert changes by re-mapping from the pristine backendProfile
    if (this.backendProfile) {
      this.mapBackendProfileToLocal(this.backendProfile);
    }
  }

  onAvatarChange(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Simulate file upload
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.userProfile.avatar = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  onAvatarChanged(newAvatarUrl: string): void {
    this.userProfile.avatar = newAvatarUrl;
    this.showSuccess('Cập nhật avatar thành công!');
  }

  // Security methods - removed as we now use toggleSetting

  changePassword(): void {
    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.showError('Mật khẩu xác nhận không khớp!');
      return;
    }

    if (this.passwordForm.newPassword.length < 6) {
      this.showError('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }

    this.isChangingPassword = true;

    const changePasswordData: ChangePassword = {
      currentPassword: this.passwordForm.currentPassword,
      newPassword: this.passwordForm.newPassword,
      confirmPassword: this.passwordForm.confirmPassword,
    };

    this.userProfileService
      .changePassword(changePasswordData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.passwordForm = {
              currentPassword: '',
              newPassword: '',
              confirmPassword: '',
            };
            this.showSuccess('Mật khẩu đã được thay đổi thành công!');
          } else {
            this.showError(
              response.message || 'Có lỗi xảy ra khi đổi mật khẩu'
            );
          }
          this.isChangingPassword = false;
        },
        error: (error) => {
          console.error('Error changing password:', error);
          this.showError('Không thể đổi mật khẩu');
          this.isChangingPassword = false;
        },
      });
  }

  // Settings methods
  saveSettings(): void {
    if (!this.userSettings) return;

    // This method is now handled by toggleSetting which calls the service directly.
    // We can keep it for potential bulk-save features in the future, but it needs to use UserSettingsService.
    this.notificationService.show('Cài đặt đã được lưu.', 'info');
  }


  // Toggle methods for settings
  toggleSetting(settingName: keyof UserSettings): void {
    if (!this.userSettings) return;

    // FIX: Create a complete copy of the current settings to preserve all values.
    // Then, toggle only the specific setting that was changed.
    const updatedSettings: UserSettings = {
      ...this.userSettings,
      [settingName]: !this.userSettings[settingName],
    };

    // Optimistically update the local state for a responsive UI.
    this.userSettings = updatedSettings;

    // Call the service to save the full updated settings object.
    this.userSettingsService.updateSettings(updatedSettings).subscribe({
      next: () => {
        this.showSuccess('Cài đặt đã được cập nhật.');
      },
      error: (err) => {
        this.showError('Không thể cập nhật cài đặt.');
        // Revert the change on error by reloading from the service
        this.userSettingsService.loadUserSettings().subscribe();
      },
    });
  }

  private handleLoadError(error: any, type: 'profile' | 'settings'): void {
    console.error(`Error loading ${type}:`, error);
    if (error.status === 401) {
      this.notificationService.show(
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
        'error'
      );
      this.router.navigate(['/login']);
      return;
    }
    this.showError(`Không thể tải thông tin ${type}`);
  }

  // Utility methods
  private showSuccess(message: string): void {
    this.notificationService.show(message, 'success');
    // Also update local state for immediate UI feedback
    this.successMessage = message;
    this.errorMessage = '';
    setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }

  private showError(message: string): void {
    this.notificationService.show(message, 'error');
    // Also update local state for immediate UI feedback
    this.errorMessage = message;
    this.successMessage = '';
    setTimeout(() => {
      this.errorMessage = '';
    }, 3000);
  }

  private showInfoMessage(message: string): void {
    this.notificationService.show(message, 'info');
  }

  // Validation methods
  isPasswordFormValid(): boolean {
    return (
      this.passwordForm.currentPassword.length > 0 &&
      this.passwordForm.newPassword.length >= 6 &&
      this.passwordForm.newPassword === this.passwordForm.confirmPassword
    );
  }

  isProfileFormValid(): boolean {
    return (
      this.userProfile.email.length > 0 &&
      this.userProfile.fullName.length > 0
    );
  }

  // Export/Import settings
  exportSettings(): void {
    if (!this.userSettings) return;

    this.userProfileService
      .exportSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          // The backend now returns the file directly, so we create the download link from the blob.
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          // The filename is now set by the backend via Content-Disposition header.
          // The browser will automatically use it. We can set a fallback here.
          link.download = `datk-settings-${new Date().toISOString().split('T')[0]}.json`;
          link.click();
          window.URL.revokeObjectURL(url);
          this.showSuccess('Cài đặt đã được xuất thành công!');
        },
        error: (error) => {
          console.error('Error exporting settings:', error);
          this.showError('Không thể xuất cài đặt');
        },
      });
  }

  onFileChange(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    // FIX: Change validation to .json
    if (!file.name.toLowerCase().endsWith('.json')) {
      this.showError('Vui lòng chọn file cài đặt (.json)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const importDto = JSON.parse(e.target.result);

        // Basic validation to ensure it's a plausible settings object
        if (typeof importDto === 'object' && importDto !== null && 'ShowOnlineStatus' in importDto) {
          this.importSettings(importDto);
        } else {
          this.showError('File không hợp lệ hoặc không đúng định dạng.');
        }
      } catch (error) {
        this.showError('Lỗi khi đọc file. Vui lòng kiểm tra lại định dạng file.');
        console.error('JSON Parse Error:', error);
      }
    };
    // FIX: Read as text for JSON
    reader.readAsText(file);
    event.target.value = '';
  }

  importSettings(importData: any): void {
    this.isSaving = true;
    this.userProfileService.importSettings(importData).subscribe({
      next: (response: ApiResponse<boolean>) => {
        this.isSaving = false;
        if (response.success) {
          this.showSuccess('Cài đặt đã được nhập thành công!');
          this.fetchInitialData(); // Reload data to reflect changes
        } else {
          this.showError(response.message || 'Không thể nhập cài đặt.');
        }
      },
      error: (err) => {
        this.isSaving = false;
        this.showError('Đã xảy ra lỗi khi nhập cài đặt.');
        console.error('Import settings error:', err);
      }
    });
  }

  // Reset methods
  resetToDefaults(): void {
    if (confirm('Bạn có chắc chắn muốn khôi phục cài đặt mặc định?')) {
      // Reset profile editable fields
      this.userProfile.phone = '' as any; // Set to empty string, saveProfile will convert to undefined
      this.userProfile.walletCode = '' as any; // Set to empty string, saveProfile will convert to undefined

      // Reset settings
      if (this.userSettings) {
        const defaultSettings: UserSettings = {
          twoFactorEnabled: false,
          loginNotificationEnabled: false,
          emailNotificationEnabled: false,
          pushNotificationEnabled: false,
          showOnlineStatus: false,
        };

        // Save profile changes
        this.saveProfile();

        // Optimistically update the local state for a responsive UI.
        this.userSettings = defaultSettings;

        // Call the service to save the full updated settings object.
        this.userSettingsService.updateSettings(defaultSettings).subscribe({
          next: () => {
            this.showSuccess('Cài đặt và profile đã được khôi phục mặc định!');
          },
          error: (err) => {
            this.showError('Không thể khôi phục cài đặt mặc định.');
            this.userSettingsService.loadUserSettings().subscribe(); // Revert on error
          },
        });
      }
    }
  }

  // Profile data is now protected - no need for fix method

  // Account management
  deleteAccount(): void {
    if (
      confirm(
        'CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn tài khoản của bạn. Bạn có chắc chắn?'
      )
    ) {
      if (
        confirm(
          'Xác nhận lần cuối: Tất cả dữ liệu sẽ bị mất và không thể khôi phục!'
        )
      ) {
        // In a real app, this would call an API to delete the account
        this.showInfoMessage(
          'Yêu cầu xóa tài khoản đã được gửi. Vui lòng kiểm tra email để xác nhận.'
        );
      }
    }
  }
}
