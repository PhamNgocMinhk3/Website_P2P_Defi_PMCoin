import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NicknameService, NicknameUpdate } from '../../nickname.service';
import { ChatUser, ChatMessage, FileMessage, ImageMessage, ChatService } from '../../chat.service';
import {
  ThemeService,
  BackgroundOption,
} from '../../../../shared/services/theme.service';
import { Subject, Subscription } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { NotificationService } from '../../../../shared/services/notification.service';
import { ImageViewerComponent } from '../../../chat/components/image-viewer/image-viewer.component';

export interface MediaItem {
  type: 'image' | 'file';
  url: string;
  name: string;
  size?: string;
  timestamp: Date;
  fileType?: string; // Thêm file type cho việc download
}

@Component({
  selector: 'app-chat-info',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageViewerComponent],
  templateUrl: './chat-info.component.html',
  styleUrls: ['./chat-info.component.scss'],
})
export class ChatInfoComponent implements OnChanges, OnInit, OnDestroy {
  @Input() user: ChatUser | null = null;
  @Input() messages: ChatMessage[] = [];
  @Output() scrollToMessage = new EventEmitter<number>();
  @Output() createGroup = new EventEmitter<void>();
  @Output() deleteConversation = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  // Tab management
  activeTab: 'general' | 'customize' | 'media' | 'options' = 'general';

  // Theme colors
  themeColors = [
    '#7b42f6',
    '#0084ff',
    '#33cc33',
    '#ff9900',
    '#ff3333',
    '#e91e63',
    '#9c27b0',
    '#673ab7',
    '#3f51b5',
    '#2196f3',
    '#00bcd4',
    '#009688',
    '#4caf50',
    '#8bc34a',
    '#cddc39',
  ];

  // Background options
  backgroundOptions: BackgroundOption[] = [
    {
      id: 'default',
      name: 'Mặc định',
      url: '',
      thumbnail:
        'https://i.pinimg.com/736x/71/e6/95/71e69508df7c4e886a79731f3e4a84a5.jpg',
    },
    {
      id: 'sunset',
      name: 'Hoàng hôn',
      url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop',
      thumbnail:
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'mountains',
      name: 'Núi non',
      url: 'https://images.pexels.com/photos/4761283/pexels-photo-4761283.jpeg',
      thumbnail:
        'https://images.pexels.com/photos/4761283/pexels-photo-4761283.jpeg',
    },
    {
      id: 'forest',
      name: 'Rừng cây',
      url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=2070&auto=format&fit=crop',
      thumbnail:
        'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'Sky',
      name: 'Bầu Trời',
      url: 'https://www.dichvuinnhanh.com/wp-content/uploads/2025/04/Anh-Dep-Hinh-Nen-Dep-Innhanh.pro_.vn-7.webp',
      thumbnail:
        'https://www.dichvuinnhanh.com/wp-content/uploads/2025/04/Anh-Dep-Hinh-Nen-Dep-Innhanh.pro_.vn-7.webp',
    },
    {
      id: 'Sea',
      name: 'Biển',
      url: 'https://cdn2.fptshop.com.vn/unsafe/Uploads/images/tin-tuc/168009/Originals/hinh-nen-bien-4.png',
      thumbnail:
        'https://cdn2.fptshop.com.vn/unsafe/Uploads/images/tin-tuc/168009/Originals/hinh-nen-bien-4.png',
    },
    {
      id: 'Earth',
      name: 'Trái Đất',
      url: 'https://cdn.mobilecity.vn/mobilecity-vn/images/2024/04/hinh-nen-trai-dat-cho-dien-thoai-1.jpg.webp',
      thumbnail:
        'https://cdn.mobilecity.vn/mobilecity-vn/images/2024/04/hinh-nen-trai-dat-cho-dien-thoai-1.jpg.webp',
    },
    {
      id: 'Black-hole',
      name: 'Hố đen vũ trụ',
      url: 'https://c4.wallpaperflare.com/wallpaper/681/554/339/abstract-planet-space-purple-wallpaper-preview.jpg',
      thumbnail:
        'https://c4.wallpaperflare.com/wallpaper/681/554/339/abstract-planet-space-purple-wallpaper-preview.jpg',
    },
    {
      id: 'Ninja',
      name: 'Ninja',
      url: 'https://c4.wallpaperflare.com/wallpaper/365/244/884/uchiha-itachi-naruto-shippuuden-anbu-silhouette-wallpaper-preview.jpg',
      thumbnail:
        'https://c4.wallpaperflare.com/wallpaper/365/244/884/uchiha-itachi-naruto-shippuuden-anbu-silhouette-wallpaper-preview.jpg',
    },
    {
      id: 'Kimetsunodaiba',
      name: 'demon-slayer',
      url: 'https://c4.wallpaperflare.com/wallpaper/708/846/337/anime-demon-slayer-kimetsu-no-yaiba-tanjirou-kamado-hd-wallpaper-preview.jpg',
      thumbnail:
        'https://c4.wallpaperflare.com/wallpaper/708/846/337/anime-demon-slayer-kimetsu-no-yaiba-tanjirou-kamado-hd-wallpaper-preview.jpg',
    },
  ];

  // Nickname editing
  isEditingNickname = false;
  newNickname = '';
  currentNickname = '';

  // Modal states
  isNotificationModalVisible = false;
  isBlockModalVisible = false;
  isReportModalVisible = false;
  isDeleteConversationModalVisible = false;

  // Notification settings
  notificationOptions = [
    { label: '5 minutes', value: 5 },
    { label: '10 minutes', value: 10 },
    { label: '1 hour', value: 60 },
    { label: 'Turn off permanently', value: -1 },
    { label: 'Turn on notifications', value: 0 },
  ];

  // Report reasons
  reportReasons = [
    'Spam',
    'Hate Speech',
    'Harassment or Bullying',
    'Misinformation',
    'Violence or Dangerous Acts',
    'Intellectual Property Violation',
    'Sensitive Content',
    'Other', // Giữ 'Other' để khớp với logic kiểm tra
  ];
  selectedReportReason = '';
  customReportReason = '';

  // Image viewer state
  isImageViewerVisible = false;
  imageViewerImages: string[] = [];
  imageViewerCurrentIndex = 0;

  // File download modal state
  isFileDownloadModalVisible = false;
  selectedFile: MediaItem | null = null;

  // Optimized media properties
  sharedImages: MediaItem[] = [];
  sharedFiles: MediaItem[] = [];

  private nicknameSubscription?: Subscription;
  private destroy$ = new Subject<void>();

  constructor(
    public themeService: ThemeService,
    private notificationService: NotificationService,
    private nicknameService: NicknameService,
    private chatService: ChatService, // Inject ChatService
    private cdr: ChangeDetectorRef // Inject ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Listen for nickname updates from the service
    this.nicknameSubscription = this.chatService.nicknameUpdated$.subscribe(update => {
      // Log để kiểm tra nickname update
      console.log('[CHAT-INFO] Nickname update received:', update);
      if (update && this.user && update.groupId === this.user.id && update.userId === this.user.otherUserId) {
          this.currentNickname = update.nickname || '';
        }
      });
    this.listenForRealtimeMedia();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.nicknameSubscription?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // FIX: Đây là chìa khóa để giải quyết vấn đề.
    // Khi @Input() user thay đổi, ngOnChanges sẽ được gọi.
    if (changes['user']) {
      const userValue = changes['user'].currentValue;
      console.log('[CHAT-INFO] Input user changed. New isOnline status:', userValue?.isOnline);
      
      this.loadCustomizations();
      // FIX: Use detectChanges() to immediately run change detection on this component
      // and its children. This is a more forceful update than markForCheck().
      this.cdr.detectChanges();
    }
    if (changes['messages']) {
      this.updateMediaLists(); // Cập nhật danh sách media khi tin nhắn thay đổi
    }
  }

  private loadCustomizations(): void {
    if (!this.user) return;

    // Load nickname
    // Nicknames in 1-on-1 chats are a bit ambiguous. Let's assume the conversation ID is the key.
    // For group chats, this would be the group ID.
    // The `user.id` here is the conversationId.
    this.currentNickname = this.nicknameService.getNickname(this.user.id, this.user.otherUserId || this.user.id) || '';

    // Load theme color
    const savedColor = localStorage.getItem(`theme_color_${this.user.id}`);
    if (savedColor) {
      this.themeService.setActiveColor(savedColor);
    } else {
      this.themeService.setActiveColor(this.themeColors[0]); // Default color
    }

    // Load background
    const savedBgId = localStorage.getItem(`theme_bg_${this.user.id}`);
    const savedBg = this.backgroundOptions.find(bg => bg.id === savedBgId);
    if (savedBg) {
      this.themeService.setActiveBackground(savedBg);
    } else {
      this.themeService.setActiveBackground(this.backgroundOptions[0]); // Default background
    }
  }

  private updateMediaLists(): void {
    if (!this.messages) {
      this.sharedImages = [];
      this.sharedFiles = [];
      return;
    }

    this.sharedImages = this.messages
      .filter((msg): msg is ChatMessage & { type: 'image', imageUrls: string[] } => msg.type === 'image' && !!msg.imageUrls)
      .flatMap((msg) =>
        (msg.imageUrls ?? []).map((url, index) => ({
          type: 'image' as const,
          url,
          name: `Image ${msg.id}-${index + 1}`,
          timestamp: msg.timestamp,
        })),
      );

    this.sharedFiles = this.messages
      .filter((msg): msg is ChatMessage & { type: 'file', fileInfo: FileMessage } => msg.type === 'file' && !!msg.fileInfo)
      .map((msg) => ({
          type: 'file' as const,
          url: msg.fileInfo!.url || '',
          name: msg.fileInfo!.name,
          size: msg.fileInfo!.size,
          timestamp: msg.timestamp,
          fileType: msg.fileInfo!.type,
      }));
  }

  private listenForRealtimeMedia(): void {
    this.chatService.realtimeMessageReceived$
      .pipe(
        // Filter messages for the current conversation
        filter((message: ChatMessage) => message.chatId === this.user?.id),
        takeUntil(this.destroy$)
      )
      .subscribe((newMessage: ChatMessage) => {
        let mediaAdded = false;
        if (newMessage.type === 'image' && newMessage.imageUrls) {
          // Thêm ảnh mới vào đầu danh sách
          const newImages = newMessage.imageUrls.map((url: string, index: number) => ({
            type: 'image' as const,
            url,
            name: `Image ${newMessage.id}-${index + 1}`,
            timestamp: newMessage.timestamp,
          }));
          this.sharedImages.unshift(...newImages);
          mediaAdded = true;
        } else if (newMessage.type === 'file' && newMessage.fileInfo) {
          // Thêm file mới vào đầu danh sách
          this.sharedFiles.unshift({
            type: 'file' as const,
            url: newMessage.fileInfo.url || '',
            name: newMessage.fileInfo.name,
            size: newMessage.fileInfo.size,
            timestamp: newMessage.timestamp,
            fileType: newMessage.fileInfo.type,
          });
          mediaAdded = true;
        }

        if (mediaAdded) this.cdr.detectChanges(); // Cập nhật giao diện
      });
  }
  // Tab methods
  setActiveTab(tab: 'general' | 'customize' | 'media' | 'options') {
    this.activeTab = tab;
  }

  // Theme methods
  changeThemeColor(color: string) {
    if (this.user) localStorage.setItem(`theme_color_${this.user.id}`, color);
    this.themeService.setActiveColor(color);
    this.notificationService.show('Theme color updated!', 'success');
  }

  changeBackground(background: BackgroundOption) {
    if (this.user) localStorage.setItem(`theme_bg_${this.user.id}`, background.id);
    this.themeService.setActiveBackground(background);
    this.notificationService.show(
      `Background changed to ${background.name}!`,
      'success'
    );
  }

  // Nickname methods
  startEditingNickname() {
    this.isEditingNickname = true;
    this.newNickname = this.currentNickname || this.user?.name || '';
  }

  saveNickname() {
    if (this.newNickname.trim() && this.user) {
      // For 1-on-1, we'll use the conversation ID as the 'group' and the other user's ID.
      this.chatService.setMemberNickname(this.user.id, this.user.otherUserId || this.user.id, this.newNickname).subscribe();
      this.isEditingNickname = false;
    }
  }

  cancelEditingNickname() {
    this.isEditingNickname = false;
    this.newNickname = '';
  }

  // Media methods

  // Image viewer methods
  openImageViewer(imageIndex: number): void {
    console.log('Clicked on image element, index:', imageIndex);
    this.imageViewerImages = this.sharedImages.map(img => img.url);
    this.imageViewerCurrentIndex = imageIndex;
    this.isImageViewerVisible = true;
  }

  closeImageViewer(): void {
    this.isImageViewerVisible = false;
    this.imageViewerImages = [];
    this.imageViewerCurrentIndex = 0;
  }

  onImageViewerIndexChange(index: number): void {
    this.imageViewerCurrentIndex = index;
  }

  // File download methods
  openFileDownloadModal(file: MediaItem): void {
    console.log('Clicked on file element:', file);
    this.selectedFile = file;
    this.isFileDownloadModalVisible = true;
  }

  // Get appropriate icon for file type
  getFileIcon(file: MediaItem): string {
    if (!file.fileType) return 'fas fa-file';

    const fileType = file.fileType.toLowerCase();

    // Document files
    if (fileType.includes('pdf')) return 'fas fa-file-pdf';
    if (fileType.includes('word') || fileType.includes('doc'))
      return 'fas fa-file-word';
    if (fileType.includes('excel') || fileType.includes('sheet'))
      return 'fas fa-file-excel';
    if (fileType.includes('powerpoint') || fileType.includes('presentation'))
      return 'fas fa-file-powerpoint';

    // Text files
    if (fileType.includes('text') || fileType.includes('txt'))
      return 'fas fa-file-alt';

    // Archive files
    if (
      fileType.includes('zip') ||
      fileType.includes('rar') ||
      fileType.includes('7z')
    )
      return 'fas fa-file-archive';

    // Image files
    if (fileType.includes('image')) return 'fas fa-file-image';

    // Video files
    if (fileType.includes('video')) return 'fas fa-file-video';

    // Audio files
    if (fileType.includes('audio')) return 'fas fa-file-audio';

    // Code files
    if (
      fileType.includes('javascript') ||
      fileType.includes('json') ||
      fileType.includes('html') ||
      fileType.includes('css') ||
      fileType.includes('typescript')
    )
      return 'fas fa-file-code';

    return 'fas fa-file';
  }

  // Get file type color
  getFileTypeColor(file: MediaItem): string {
    if (!file.fileType) return '#6b7280';

    const fileType = file.fileType.toLowerCase();

    if (fileType.includes('pdf')) return '#dc2626';
    if (fileType.includes('word') || fileType.includes('doc')) return '#2563eb';
    if (fileType.includes('excel') || fileType.includes('sheet'))
      return '#059669';
    if (fileType.includes('powerpoint') || fileType.includes('presentation'))
      return '#ea580c';
    if (
      fileType.includes('zip') ||
      fileType.includes('rar') ||
      fileType.includes('7z')
    )
      return '#7c3aed';
    if (fileType.includes('image')) return '#0891b2';
    if (fileType.includes('video')) return '#dc2626';
    if (fileType.includes('audio')) return '#059669';
    if (
      fileType.includes('javascript') ||
      fileType.includes('json') ||
      fileType.includes('html') ||
      fileType.includes('css') ||
      fileType.includes('typescript')
    )
      return '#f59e0b';

    return '#6b7280';
  }

  closeFileDownloadModal(): void {
    this.isFileDownloadModalVisible = false;
    this.selectedFile = null;
  }

  downloadFile(): void {
    if (this.selectedFile) {
      try {
        // Tạo link download
        const link = document.createElement('a');

        if (this.selectedFile.url) {
          // Nếu có URL thực, sử dụng URL đó
          link.href = this.selectedFile.url;
        } else {
          // Tạo blob URL giả lập cho demo (trong thực tế sẽ có file data thực)
          const demoContent = `Demo file content for ${this.selectedFile.name}`;
          const blob = new Blob([demoContent], {
            type: this.selectedFile.fileType || 'application/octet-stream',
          });
          link.href = URL.createObjectURL(blob);
        }

        link.download = this.selectedFile.name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cleanup blob URL if created
        if (!this.selectedFile.url) {
          URL.revokeObjectURL(link.href);
        }

        this.notificationService.show(
          `Đã tải xuống ${this.selectedFile.name}`,
          'success'
        );
        this.closeFileDownloadModal();
      } catch (error) {
        this.notificationService.show('Lỗi khi tải file.', 'error');
        // Download error
      }
    }
  }

  // Options methods
  openNotificationModal() {
    this.isNotificationModalVisible = true;
  }

  closeNotificationModal() {
    this.isNotificationModalVisible = false;
  }

  setNotificationSetting(option: any) {
    let message = '';
    if (option.value === 0) {
      message = 'Notifications turned on';
    } else if (option.value === -1) {
      message = 'Notifications turned off permanently';
    } else {
      message = `Notifications muted for ${option.label}`;
    }

    this.notificationService.show(message, 'success');
    this.closeNotificationModal();
  }

  openBlockModal() {
    this.isBlockModalVisible = true;
  }

  closeBlockModal() {
    this.isBlockModalVisible = false;
  }

  confirmBlock() {
    // FIX: Use `otherUserId` for blocking in 1-on-1 chats, not the conversation `id`.
    const userIdToBlock = this.user?.otherUserId;

    if (!userIdToBlock) {
      this.notificationService.show('Không thể xác định người dùng để chặn.', 'error');
      this.closeBlockModal();
      return;
    }

    this.chatService.blockUser(userIdToBlock).subscribe({
      next: () => {
        this.notificationService.show('Đã chặn người dùng thành công.', 'success');
        this.closeBlockModal();
        this.close.emit(); // Close the info panel
      },
      error: (err: any) => {
        console.error('Failed to block user:', err);
        this.notificationService.show(
          err.error?.message || 'Không thể chặn người dùng. Vui lòng thử lại.',
          'error'
        );
      },
    });
  }

  openReportModal() {
    this.isReportModalVisible = true;
    this.selectedReportReason = '';
    this.customReportReason = '';
  }

  closeReportModal() {
    this.isReportModalVisible = false;
    this.selectedReportReason = '';
    this.customReportReason = '';
  }

  submitReport() {
    if (!this.user) return;
    if (!this.selectedReportReason) {
      this.notificationService.show(
        'Please select a reason for reporting',
        'error'
      );
      return;
    }

    if (
      this.selectedReportReason === 'Other' &&
      !this.customReportReason.trim()
    ) {
      this.notificationService.show(
        'Please provide details for your report',
        'error'
      );
      return;
    }

    this.chatService.reportUser(
      this.user.id,
      this.selectedReportReason,
      this.customReportReason
    ).subscribe({
      next: () => {
        this.notificationService.show(
          'Report submitted successfully. Thank you for helping keep our community safe.',
          'success'
        );
        this.closeReportModal();
      },
      error: (err: any) => {
        console.error('Failed to submit report:', err);
        this.notificationService.show('Failed to submit report. Please try again.', 'error');
      }
    });
  }

  // Create Group
  onCreateGroup(): void {
    // Create group clicked
    this.createGroup.emit();
  }

  // Delete Conversation Modal
  openDeleteConversationModal(): void {
    this.isDeleteConversationModalVisible = true;
  }

  closeDeleteConversationModal(): void {
    this.isDeleteConversationModalVisible = false;
  }

  confirmDeleteConversation(): void {
    this.deleteConversation.emit();
    this.closeDeleteConversationModal();
  }
}
