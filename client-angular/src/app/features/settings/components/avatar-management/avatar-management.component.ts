import { Component, EventEmitter, Output, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../../../core/services/user-profile.service';

@Component({
  selector: 'app-avatar-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './avatar-management.component.html',
  styleUrls: ['./avatar-management.component.scss'],
})
export class AvatarManagementComponent {
  @Input() currentAvatar: string =
    'https://w7.pngwing.com/pngs/205/731/png-transparent-default-avatar.png';
  @Output() avatarChanged = new EventEmitter<string>();

  private userProfileService = inject(UserProfileService);

  previewUrl: string | null = null;
  selectedFile: File | null = null;
  isUploading = false;
  uploadError: string | null = null;

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validate file type
      if (!this.isValidImageFile(file)) {
        this.uploadError = 'Please select a valid image file (JPG, PNG, WebP)';
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.uploadError = 'File size must be less than 5MB';
        return;
      }

      this.selectedFile = file;
      this.uploadError = null;

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previewUrl = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  private isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return validTypes.includes(file.type);
  }

  saveAvatar(): void {
    if (!this.selectedFile || !this.previewUrl) return;

    this.isUploading = true;
    this.uploadError = null;

    // Call real API to upload avatar
    this.userProfileService.uploadAvatar(this.selectedFile).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.avatarChanged.emit(response.data); // URL from server
          this.clearPreview();
        } else {
          this.uploadError = response.message || 'Upload failed';
        }
        this.isUploading = false;
      },
      error: (error) => {
        this.uploadError = 'Upload failed. Please try again.';
        this.isUploading = false;
        console.error('Avatar upload error:', error);
      },
    });
  }

  clearPreview(): void {
    this.previewUrl = null;
    this.selectedFile = null;
    this.uploadError = null;
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById(
      'avatar-input'
    ) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  removeAvatar(): void {
    const defaultAvatar =
      'https://i.pinimg.com/236x/5e/e0/82/5ee082781b8c41406a2a50a0f32d6aa6.jpg';
    this.avatarChanged.emit(defaultAvatar);
    this.clearPreview();
  }

  // Methods needed by HTML template
  saveChanges(): void {
    this.saveAvatar();
  }

  cancelChanges(): void {
    this.clearPreview();
  }

  get displayAvatar(): string {
    return (
      this.previewUrl ||
      this.currentAvatar ||
      '/assets/images/default-avatar.png'
    );
  }

  get hasChanges(): boolean {
    return this.selectedFile !== null;
  }
}
