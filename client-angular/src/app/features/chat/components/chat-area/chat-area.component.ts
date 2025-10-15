import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, forkJoin, of, BehaviorSubject, merge } from 'rxjs';
import { takeUntil, map, take, catchError, switchMap, filter } from 'rxjs/operators';
import { Router } from '@angular/router';

// Services
import {
  ChatService,
  ChatUser,
  ChatMessage,
  NewMessagePayload,
  GroupMember
} from '../../chat.service';
import { AuthService, User } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { ThemeService } from '../../../../shared/services/theme.service';
import { ChatSignalrService } from '../../chat-signalr.service';
import { GifService, GifResult } from '../../services/gif.service';
import { NicknameService } from '../../nickname.service';
import { FileUploadService, UploadedFile } from '../../services/file-upload.service';

// Child Components
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { ChatMessageComponent } from '../chat-message/chat-message.component';
import { ChatInputComponent } from '../chat-input/chat-input.component';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { GroupCreationComponent } from '../group-creation/group-creation.component';
import { AppointmentCreatorComponent } from '../appointment-creator/appointment-creator.component';

import { SearchModalComponent } from '../search-modal/search-modal.component';

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChatHeaderComponent,
    ChatMessageComponent,
    ChatInputComponent,
    ImageViewerComponent,
    GroupCreationComponent,
    AppointmentCreatorComponent,
    SearchModalComponent,
  ],
  templateUrl: './chat-area.component.html',
  styleUrls: ['./chat-area.component.scss'],
})
export class ChatAreaComponent implements OnInit, OnDestroy {
  // --- STATE MANAGEMENT ---
  selectedUser$!: Observable<ChatUser | null>;
  currentUser: ChatUser | null = null;
  messages: ChatMessage[] = [];
  isBlockedOrBlocking$!: Observable<boolean>;  
  isInputDisabled$!: Observable<boolean>;
  // Local theme management
  private themeColorSubject = new BehaviorSubject<string | null>('#7b42f6');
  themeColor$ = this.themeColorSubject.asObservable();
  private backgroundUrlSubject = new BehaviorSubject<string | null>('');
  backgroundUrl$ = this.backgroundUrlSubject.asObservable();

  // --- UI VISIBILITY MANAGEMENT ---
  public isOptionsMenuModalVisible = false;
  public isPollModalVisible = false;
  public isGifModalVisible = false;
  public isGroupCreationVisible = false;
  public isAppointmentCreatorVisible = false;
  public isSearchModalVisible = false;
  public messageForReaction: ChatMessage | null = null; // For the reaction modal

  // --- MODAL DATA ---
  pollQuestion: string = '';
  pollOptions: { text: string }[] = [{ text: '' }, { text: '' }];
  gifSearchTerm: string = '';
  gifResults: GifResult[] = [];
  isLoadingGifs: boolean = false;

  // --- ADD POLL OPTION ---
  public isAddPollOptionModalVisible = false;
  currentPollMessageId: string | null = null;
  currentPollQuestion = '';
  currentPollOptions: any[] = [];
  newPollOptionText = '';

  // --- AUDIO RECORDING ---
  isRecording: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  // --- IMAGE VIEWER ---
  isImageViewerVisible: boolean = false;
  imageViewerImages: string[] = [];
  imageViewerCurrentIndex: number = 0;

  private destroy$ = new Subject<void>();

  @Output() toggleInfoSidebar = new EventEmitter<void>();

  constructor(
    private chatService: ChatService,
    private notificationService: NotificationService,
    private themeService: ThemeService,
    private gifService: GifService,
    private authService: AuthService,
    private fileUploadService: FileUploadService,
    private nicknameService: NicknameService,
    private chatSignalrService: ChatSignalrService,
    private router: Router
  ) {
  }

  addPollOption(): void {
    if (this.pollOptions.length < 10) {
      this.pollOptions.push({ text: '' });
    } else {
      this.notificationService.show('Đã đạt tối đa 10 lựa chọn.', 'error');
    }
  }
  removePollOption(index: number): void {
    if (this.pollOptions.length > 2) {
      this.pollOptions.splice(index, 1);
    }
  }
  ngOnInit(): void {
    this.selectedUser$ = this.chatService.getSelectedUser();

    // FIX: Ensure the service exists before subscribing to its observables.
    // This definitively solves the "Object is possibly 'undefined'" race condition.
    if (this.chatSignalrService) {
      // Initialize call handlers
      this.chatSignalrService.incomingCall$.pipe(
        takeUntil(this.destroy$)
      ).subscribe((callData: any) => {
        this.onIncomingCall(callData);
      });

      this.chatSignalrService.callEnded$.pipe(
        takeUntil(this.destroy$)
      ).subscribe(() => this.endCall());
    }

    this.isBlockedOrBlocking$ = this.selectedUser$.pipe(
      map((user: ChatUser | null) => !!(user && (user.isBlockedByYou || user.isBlockedByOther)))
    );

    // Re-evaluate when the selected user changes OR when group settings are updated in real-time.
    const triggerReevaluation$ = merge(
      this.selectedUser$,
      this.chatService.groupSettingsUpdated$
    );
    this.isInputDisabled$ = triggerReevaluation$.pipe(
      takeUntil(this.destroy$),
      // In either case, we need the *current* selected user from the service.
      switchMap((_: ChatUser | null | { conversationId: string; settings: any; }) => {
        const selectedUser = this.chatService.getCurrentSelectedUser();

        if (!selectedUser) { return of(true); } // Disable if no user selected
        if (selectedUser.isBlockedByYou || selectedUser.isBlockedByOther) return of(true); // Disable if blocked

        if (selectedUser.isGroup && selectedUser.settings?.onlyAdminsCanSend) {
          // For groups, we need the current user's role in that group
          return this.authService.currentUser$.pipe( 
            switchMap((currentUser: User | null) => {
              if (!currentUser) return of(true); // Disable if not logged in

              return this.chatService.getGroupMembers(selectedUser.id).pipe( 
                map((members: GroupMember[]) => {
                  const currentUserMember = members.find(m => m.id === currentUser.id);
                  return !(currentUserMember?.role === 'admin' || currentUserMember?.role === 'owner');
                }),
                // Disable input if fetching members fails
                catchError(() => of(true))
              );
            })
          )
        }
        return of(false); // Enabled by default
      })
    );

    // Get the actual logged-in user from AuthService
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      if (user) {
        this.currentUser = {
          id: user.id,
          name: user.username,
          avatar: user.avatar || null, // Convert undefined to null
          active: true, // Assuming the current user is active
          lastMessage: '', time: ''
        };
      }
    });

    this.selectedUser$.pipe(
      takeUntil(this.destroy$),
      filter((user): user is ChatUser => user !== null)
    ).subscribe((user) => {
    if (user) {
      this.selectedUserId = user.id;
      this.selectedUserIsGroup = !!user.isGroup;
      
      // When a user is selected, get their messages from the service
      this.chatService.getMessagesObservable(user.id).subscribe((messages: ChatMessage[]) => {
        this.messages = messages;
        // TODO: Scroll to bottom
      });        this.chatService.nicknameUpdated$.pipe(takeUntil(this.destroy$)).subscribe(update => {
          if (update && user.isGroup && update.groupId === user.id) {
            this.messages = this.messages.map(msg => {
              if (msg.senderId === update.userId) {
                return { ...msg, senderUsername: update.nickname || msg.senderUsername };
              }
              return msg;
            });
          }
        });

        // Listen for theme changes from the info panel in real-time
        this.themeService.activeColor$.pipe(takeUntil(this.destroy$)).subscribe((color: string | null) => {
          this.themeColorSubject.next(color);
        });
        this.themeService.activeBackground$.pipe(takeUntil(this.destroy$)).subscribe((bg: { id: string; name: string; url: string; }) => {
          this.backgroundUrlSubject.next(bg.url);
        });

        // Load and apply theme for the selected user
        this.loadAndApplyTheme(user);
      } else {
        this.messages = [];
        // Reset to default theme when no user is selected
        this.themeColorSubject.next('#7b42f6');
        this.backgroundUrlSubject.next('');
      }
    });

    // Listen to header call events via template bindings (outputs from ChatHeader)
  }

  // --- CALL / MEDIA HANDLING ---
  public isCalling = false;
  public incomingCallData: { callerId: string; callerName: string; callId: string; callType: 'audio' | 'video'; isGroupCall: boolean; } | null = null;
  public callType: 'audio' | 'video' | null = null;
  private callStartTime: number | null = null;
  private selectedUserId: string | null = null;
  private selectedUserIsGroup = false;
  private localStream: MediaStream | null = null;

  async startCall(type: 'audio' | 'video') {
    console.log(`[ChatArea] startCall initiated. Type: ${type}`);
    if (this.isCalling) {
      this.notificationService.show('You are already in a call', 'error');
      return;
    }

    const selectedUser = this.chatService.getCurrentSelectedUser();
    if (!selectedUser || !this.selectedUserId) {
      this.notificationService.show('No user selected for call', 'error');
      return;
    }

    // Check if recipient is busy first (logic này có thể cần backend hỗ trợ)
    try {
      // Giả sử callUser sẽ throw error nếu user busy
      // await this.chatSignalrService.checkUserBusy(selectedUser.id);
    } catch (error: any) {
      this.notificationService.show('User is busy', 'error');
      return;
    }

    try {
      // Request permissions first
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video'
      };
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Permissions granted, proceed with call
      this.isCalling = true;
      this.callType = type;
      this.callStartTime = Date.now(); // Start tracking duration

      // Notify SignalR service about call attempt
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // `selectedUser.id` ở đây là `conversationId`
      if (this.chatSignalrService) {
        this.chatSignalrService.callUser(selectedUser.otherUserId!, callId, type, selectedUser.id);
      }

      // Navigate to call screen
      this.router.navigate(['/call'], {
        state: {
          callType: type,
          remoteUserId: selectedUser.otherUserId,
          conversationId: selectedUser.id, // <-- FIX: Pass conversationId
          callId: callId, // <-- FIX: Pass callId to the call page
          isGroup: this.selectedUserIsGroup,
          isCaller: true
        }
      }).then(() => {
        // Clean up the local stream in chat-area after successfully navigating
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => track.stop());
          this.localStream = null;
        }
      });
    } catch (err) {
      this.notificationService.show('Không thể truy cập micro/camera. Vui lòng kiểm tra quyền.', 'error');
      this.endCall();
    }
  }

  // Called when the callee accepts 
  // Handles incoming call
  onIncomingCall(payload: { fromUserId: string; fromUserName: string; callId: string; callType: 'audio' | 'video'; isGroupCall: boolean; }) {
    // If already in a call, reject with busy message
    if (this.isCalling) {
      this.chatSignalrService?.rejectCall(payload.fromUserId, payload.callId);
      return;
    }
    
    // Hiển thị popup cuộc gọi đến
    // FIX: Map server payload to local data structure consistently.
    this.incomingCallData = {
      callerId: payload.fromUserId,
      callerName: payload.fromUserName,
      callId: payload.callId,
      callType: payload.callType,
      isGroupCall: payload.isGroupCall
    };
  }

  async acceptIncomingCall() {
    console.log('[ChatArea] acceptIncomingCall initiated.');
    if (!this.incomingCallData) return;

    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: this.incomingCallData.callType === 'video'
      };
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Điều hướng đến trang cuộc gọi với trạng thái là người nhận
      this.router.navigate(['/call'], {
        state: {
          ...this.incomingCallData,
          conversationId: this.incomingCallData.callId.split('_')[2], // Extract from callId if not present, or adjust payload
          isIncoming: true // Đánh dấu đây là cuộc gọi đến cần accept
        }
      });

      this.incomingCallData = null; // Đóng popup
    } catch (err) {
      this.notificationService.show('Không thể truy cập micro/camera. Vui lòng kiểm tra quyền.', 'error');
      this.rejectIncomingCall(); // Tự động từ chối nếu không có quyền
    }
  }

  rejectIncomingCall() {
    console.log('[ChatArea] rejectIncomingCall initiated.');

    const callDataToReject = this.incomingCallData;
    this.incomingCallData = null;

    if (!callDataToReject) {
      return;
    }

    if (this.chatSignalrService && typeof this.chatSignalrService.rejectCall === 'function') {
      const result = this.chatSignalrService.rejectCall(
        callDataToReject.callerId,
        callDataToReject.callId
      );

      // Nếu trả về Promise thì bắt lỗi bằng catch
      if (result && typeof (result as any).catch === 'function') {
        (result as Promise<any>).catch((err: any) =>
          console.error('Error rejecting call:', err)
        );
      } else {
        // Nếu không trả về Promise, vẫn log để debug (hoặc tùy bạn xử lý)
        console.log('rejectCall invoked (no Promise returned).');
      }
    }





  }


  // Called from the call screen when user rejects call
  public rejectCall(callerId: string): void {
    // Send reject message
    const content = this.selectedUserIsGroup
      ? `${this.currentUser?.name} đã từ chối cuộc gọi.`
      : 'Cuộc gọi đã bị từ chối.';

    this.addMessage({type: 'text', text: content});
    
    // Notify other user
    // this.chatSignalrService.rejectCall(callerId, 'rejected'); // Logic này nên nằm trong call-page
    
    // this.router.navigate(['/chat']);
  }

  private sendGroupCallJoinMessage(): void {
    if (!this.currentUser) return;
    
    const content = `${this.currentUser.name} đã tham gia cuộc gọi.`;
    this.addMessage({type: 'text', text: content});
  }

  private sendGroupCallLeaveMessage(): void {
    if (!this.currentUser) return;

    const content = `${this.currentUser.name} đã rời cuộc gọi.`;
    this.addMessage({type: 'text', text: content});
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  }

  private sendCallEndMessage(): void {
    // Skip if we don't have start time or selected user
    if (!this.callStartTime || !this.selectedUserId) return;

    const duration = Date.now() - this.callStartTime;
    const durationStr = this.formatDuration(duration);

    const content = this.selectedUserIsGroup 
      ? `Cuộc gọi nhóm đã kết thúc. Thời lượng: ${durationStr}`
      : `Cuộc gọi đã kết thúc. Thời lượng: ${durationStr}`;

    this.addMessage({type: 'text', text: content});
  }

  private sendMissedCallMessage(): void {
    if (!this.selectedUserId) return;

    const content = this.callType === 'video'
      ? 'Bạn đã bỏ lỡ cuộc gọi video của tôi, vui lòng gọi lại ngay!'
      : 'Bạn đã bỏ lỡ cuộc gọi của tôi, vui lòng gọi lại ngay!';

    this.addMessage({ type: 'text', text: content });
  }

  endCall(): void {
    this.isCalling = false; 
    this.callType = null;
    this.callStartTime = null;

    // Dọn dẹp stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Return to chat if needed
    if (this.router.url.includes('/call')) {
      this.router.navigate(['/chat']);
    }
  }

  private loadAndApplyTheme(user: ChatUser): void {
    // Listen for theme changes from the info panel in real-time
    this.themeService.activeColor$.pipe(takeUntil(this.destroy$)).subscribe((color: string | null) => {
      this.themeColorSubject.next(color);
    });
    this.themeService.activeBackground$.pipe(takeUntil(this.destroy$)).subscribe((bg: { id: string; name: string; url: string; }) => {
      this.backgroundUrlSubject.next(bg.url);
    });
    if (user.isGroup) {
      // For group chats, apply a default theme.
      // This could be extended later to support group-specific themes.
      this.themeColorSubject.next('#7b42f6');
      this.backgroundUrlSubject.next('');
      return;
    }

    // For 1-on-1 chats, load customizations from localStorage.
    const color = localStorage.getItem(`theme_color_${user.id}`);
    this.themeColorSubject.next(color || '#7b42f6'); // Fallback to default color

    const bgId = localStorage.getItem(`theme_bg_${user.id}`);
    const bg = this.themeService.backgroundOptions.find((b: { id: string; }) => b.id === bgId);
    this.backgroundUrlSubject.next(bg?.url || ''); // Fallback to no background
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getChatHeaderUser(user: ChatUser): ChatUser {
    if (!user) return user;
    // For a 1-on-1 chat, the nickname is for the 'other' user.
    // For groups, the name is already correct.
    // We create a new object to avoid mutating the original user object,
    // which can cause unexpected side effects in change detection.
    if (user.isGroup) {
      return { ...user };
    }
    const nickname = this.nicknameService.getNickname(user.id, user.otherUserId || '');
    return { ...user, name: nickname || user.name };
  }

  onUnblockUser(): void {
    this.selectedUser$.pipe(take(1)).subscribe(user => {
      if (user && user.otherUserId) {
        this.chatService.unblockUser(user.otherUserId).subscribe({
          // The UI will update via SignalR, but we can show a notification here
          // The service already shows one, so this might be redundant.
          error: (err: any) => {
            this.notificationService.show('Failed to unblock user.', 'error');
            console.error(err);
          }
        });
      }
    });
  }

  /**
   * Determines if the sender's info (avatar, name) should be displayed for a message.
   * This creates the message grouping effect in group chats.
   * @param currentMessage The message being rendered.
   * @param index The index of the message in the messages array.
   * @returns `true` if the sender info should be shown, otherwise `false`.
   */
  public shouldShowSenderInfo(currentMessage: ChatMessage, index: number): boolean {
    const selectedUser = this.chatService.getCurrentSelectedUser();
    // For 1-on-1 chats, always show the avatar for incoming messages.
    if (!selectedUser?.isGroup) {
      return !currentMessage.isOutgoing;
    }

    // Never show for outgoing messages, as they are styled differently.
    if (currentMessage.isOutgoing) {
      return false;
    }

    // Always show for the very first message in the list.
    if (index === 0) {
      return true;
    }

    const previousMessage = this.messages[index - 1];
    // Show if the sender is different from the previous message's sender.
    return previousMessage.senderId !== currentMessage.senderId;
  }

  // --- EVENT HANDLERS ---
  handleSendMessage(text: string): void {
    this.addMessage({ type: 'text', text });
  }

  handleSendFile(file: File): void {
    if (file.size > 25 * 1024 * 1024) {
      this.notificationService.show('File is too large (max 25MB).', 'error');
      return;
    }
    this.notificationService.show(`Uploading ${file.name}...`, 'info');
    this.fileUploadService.uploadFile(file).pipe(
      take(1),
      catchError((err: any) => {
        this.notificationService.show('File upload failed.', 'error');
        return of(null);
      })
    ).subscribe((uploadedFile: UploadedFile | null) => {
      if (uploadedFile) {
        this.addMessage({
          type: 'file', // Corrected payload structure
          fileInfo: {
            name: uploadedFile.fileName,
            size: uploadedFile.fileSize,
            url: uploadedFile.url,
            type: uploadedFile.mimeType,
          }
        });
        this.notificationService.show('File uploaded successfully.', 'success');
      }
    });
  }

  handleSendImages(files: FileList): void {
    const uploadObservables: Observable<UploadedFile | null>[] = [];

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/') && file.size <= 15 * 1024 * 1024) {
        uploadObservables.push(
          this.fileUploadService.uploadFile(file).pipe(
            catchError((err: any) => {
              this.notificationService.show(`Failed to upload ${file.name}.`, 'error');
              return of(null); // Return null for failed uploads
            })
          )
        );
      } else if (file.size > 15 * 1024 * 1024) {
        this.notificationService.show(
          `Image '${file.name}' is too large (max 15MB)`,
          'error'
        );
      }
    }

    if (uploadObservables.length > 0) {
      this.notificationService.show(`Uploading ${uploadObservables.length} image(s)...`, 'info');
      forkJoin(uploadObservables).subscribe((results: (UploadedFile | null)[]) => {
        const successfulUploads = results.filter(r => r !== null) as UploadedFile[];
        if (successfulUploads.length > 0) {
          this.addMessage({ type: 'image', imageUrls: successfulUploads.map(f => f.url) });
          this.notificationService.show('Images uploaded successfully.', 'success');
        }
      });
    }
  }

  async handleRecordAudio(): Promise<void> {
    if (this.isRecording) {
      this.mediaRecorder?.stop();
    } else {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.notificationService.show('Audio recording is not supported.', 'error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        this.isRecording = true;
        this.notificationService.show('Recording started...', 'info');

        // --- START: Improved MimeType Handling ---
        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/mp4',
          'audio/webm',
          'audio/ogg',
        ];
        const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

        if (!supportedMimeType) {
          this.notificationService.show('No supported audio format found for recording.', 'error');
          this.isRecording = false;
          return;
        }

        this.mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
        // --- END: Improved MimeType Handling ---

        this.audioChunks = [];
        this.mediaRecorder.ondataavailable = (event) =>
          this.audioChunks.push(event.data);
        this.mediaRecorder.onstop = () => {
          this.isRecording = false;
          const audioBlob = new Blob(this.audioChunks, { type: supportedMimeType });
          const audioFile = new File([audioBlob], `recording-${new Date().toISOString()}.webm`, { type: supportedMimeType });
          this.notificationService.show('Uploading recording...', 'info');
          this.fileUploadService.uploadFile(audioFile).pipe(
            take(1),
            catchError((err: any) => {
              this.notificationService.show('Audio upload failed.', 'error');
              return of(null);
            })
          ).subscribe((uploadedFile: UploadedFile | null) => {
            if (uploadedFile) {
              this.addMessage({ type: 'audio', audioUrl: uploadedFile.url });
              this.notificationService.show('Recording uploaded.', 'success');
            }
          });

          stream.getTracks().forEach((track) => track.stop());
        };
        this.mediaRecorder.start();
      } catch (err: any) {
        let errorMessage = 'Could not start recording. Please grant permission.';
        // Check the specific error type to give a more helpful message
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMessage = 'Quyền truy cập micro đã bị từ chối. Vui lòng nhấp vào biểu tượng 🔒 trên thanh địa chỉ để cho phép.';
        } else if (err.name === 'NotFoundError') {
            errorMessage = 'Không tìm thấy micro trên thiết bị của bạn.';
        }

        this.notificationService.show(errorMessage, 'error');
        this.isRecording = false;
      }
    }
  }
  handleOpenReactionPicker(message: ChatMessage, event: MouseEvent): void {
    event.stopPropagation();
    this.messageForReaction = message;
  }

  handleVote(event: { messageId: string; optionIndex: number }): void {
    const message = this.messages.find(m => m.id === event.messageId);
    if (message && message.type === 'poll' && message.pollData) {
      this.chatService.voteOnPoll(event.messageId, event.optionIndex, message.pollData);
    }
  }

  onReactionSelected(event: { messageId: string, reaction: string }): void {
    this.chatService.toggleReaction(event.messageId, event.reaction);
    this.messageForReaction = null; // Close the modal
  }

  onAddPollOption(messageId: string): void {
    const message = this.messages.find((m) => m.id === messageId);
    if (message && message.type === 'poll' && message.pollData) {
      this.currentPollMessageId = message.id;
      this.currentPollQuestion = message.pollData.question;
      this.currentPollOptions = message.pollData.options;
      this.newPollOptionText = ''; // Reset input
      this.isAddPollOptionModalVisible = true;
    }
  }
  // --- CORE LOGIC ---
  private addMessage(payload: NewMessagePayload): void {
    // Get the currently selected user/group to add message to
    this.selectedUser$.pipe(take(1)).subscribe((selectedUser: ChatUser | null) => {
      if (selectedUser) {
        this.chatService.addMessage(selectedUser.id, payload);
        // Không cần dòng này nữa, giao diện sẽ tự cập nhật qua Observable
      }
    });
  }

  createPoll(): void {
    if (
      this.pollQuestion.trim() &&
      this.pollOptions.every((opt) => opt.text.trim())
    ) {
      this.addMessage({
        type: 'poll',
        pollData: {
          question: this.pollQuestion,
          options: this.pollOptions.map((opt) => ({
            text: opt.text,
            votes: 0,
            voters: [],
          })),
        },
      });
      this.closePollModal();
    } else {
      this.notificationService.show(
        'Please enter a question and all options.',
        'error'
      );
    }
  }

  searchGifs(): void {
    if (!this.gifSearchTerm.trim()) {
      // Load trending GIFs when search is empty
      this.loadTrendingGifs();
      return;
    }

    this.isLoadingGifs = true;
    this.gifService
      .searchGifs(this.gifSearchTerm, 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (gifs: GifResult[]) => {
          this.gifResults = gifs;
          this.isLoadingGifs = false;
        },
        error: () => {
          this.notificationService.show(
            'Không thể tải GIF. Vui lòng thử lại.',
            'error'
          );
          this.isLoadingGifs = false;
        },
      });
  }

  private loadTrendingGifs(): void {
    this.isLoadingGifs = true;
    this.gifService
      .getTrendingGifs(20)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (gifs: GifResult[]) => {
          this.gifResults = gifs;
          this.isLoadingGifs = false;
        },
        error: () => {
          this.isLoadingGifs = false;
        },
      });
  }

  selectGif(gif: GifResult): void {
    this.addMessage({ type: 'gif', gifUrl: gif.url });
    this.closeGifModal();
  }

  // --- MODAL TOGGLES ---
  openPollModal(): void {
    this.isPollModalVisible = true;
  }
  closePollModal(): void {
    this.isPollModalVisible = false;
  }
  openGifModal(): void {
    this.isGifModalVisible = true;
    this.gifSearchTerm = '';
    // Load trending GIFs when modal opens
    this.loadTrendingGifs();
  }
  closeGifModal(): void {
    this.isGifModalVisible = false;
  }

  // --- IMAGE VIEWER METHODS ---
  handleImageClick(event: { imageUrls: string[]; startIndex: number }): void {
    this.imageViewerImages = event.imageUrls;
    this.imageViewerCurrentIndex = event.startIndex;
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

  // --- NEW FEATURE METHODS ---

  // Group Creation
  openGroupCreation(): void {
    this.isGroupCreationVisible = true;
  }

  closeGroupCreation(): void {
    this.isGroupCreationVisible = false;
  }

  onGroupCreated(groupData: { name: string; members: ChatUser[] }): void {
    this.chatService.createGroup(groupData.name, groupData.members).subscribe({
      next: (newGroup: ChatUser) => {
        // The service automatically selects the new group.
        this.notificationService.show(
          `Group "${newGroup.name}" created successfully!`,
          'success'
        );
        this.closeGroupCreation();
      },
      error: (err: any) => {
        this.notificationService.show(err.error?.message || 'Failed to create group.', 'error');
      }
    });
  }

  // Appointment Creation
  openAppointmentCreator(): void {
    if (this.currentUser) {
      this.isAppointmentCreatorVisible = true;
    } else {
      // This can happen if the user clicks the button before user data has loaded.
      this.notificationService.show('User data is not yet available. Please try again in a moment.', 'warning');
    }
  }

  closeAppointmentCreator(): void {
    this.isAppointmentCreatorVisible = false;
  }

  onAppointmentCreated(appointment: any): void {
    this.addMessage({
      type: 'appointment',
      appointmentData: appointment,
    });
    this.closeAppointmentCreator();
    this.notificationService.show(
      'Appointment created successfully!',
      'success'
    );
  }

  // Forward Message
  onForwardMessage(messageId: string): void {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      // TODO: Implement forward message logic
      this.notificationService.show(
        'Chức năng chuyển tiếp sẽ được triển khai!',
        'info'
      );
    }
  }

  

  onScrollToMessage(messageId: string): void {
    this.chatService.scrollToMessage(messageId);
  }

  onDeleteMessage(messageId: string): void {
    if (this.selectedUser$) {
      this.selectedUser$.pipe(take(1)).subscribe((user: ChatUser | null) => {
        if (user) this.chatService.deleteMessage(user.id, messageId);
      });
    }
  }

  // Search Modal
  openSearchModal(): void {
    this.isSearchModalVisible = true;
  }

  closeSearchModal(): void {
    this.isSearchModalVisible = false;
  }

  // Close Add Poll Option Modal
  closeAddPollOptionModal(): void {
    this.isAddPollOptionModalVisible = false;
    this.currentPollMessageId = null;
    this.currentPollQuestion = '';
    this.currentPollOptions = [];
    this.newPollOptionText = '';
  }

  // Check if current input is duplicate
  isDuplicateOption(): boolean {
    if (!this.newPollOptionText.trim() || !this.currentPollOptions.length)
      return false;

    return this.currentPollOptions.some(
      (opt) =>
        opt.text.toLowerCase() === this.newPollOptionText.trim().toLowerCase()
    );
  }

  // Confirm Add Poll Option
  confirmAddPollOption(): void {
    if (!this.newPollOptionText.trim() || !this.currentPollMessageId) return;
    if (this.isDuplicateOption()) return;

    // Call the service to add the option via API
    this.chatService.addPollOption(this.currentPollMessageId, this.newPollOptionText.trim());
    
      // Close modal
      this.closeAddPollOptionModal();
  }

}
