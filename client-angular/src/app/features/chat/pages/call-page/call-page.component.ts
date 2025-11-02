import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatUser } from '../../chat.service';
import { Router } from '@angular/router';
import { ChatService } from '../../chat.service';
import { ChatSignalrService } from '../../chat-signalr.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { CallScreenComponent } from '../../components/call-screen/call-screen.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-call-page',
  standalone: true,
  imports: [CommonModule, CallScreenComponent],
  template: `
    <div class="call-page">
      <!-- Waiting Screen for Caller -->
      <div *ngIf="isCaller && !isCallConnected" class="waiting-screen">
        <div class="user-info">
          <div class="avatar-container">
            <div class="pulse"></div>
            <img [src]="remoteUser?.avatar || 'https://ui-avatars.com/api/?name=' + (remoteUser?.name || '?')" 
                 alt="Remote user avatar" 
                 class="avatar">
          </div>
          <h2 class="user-name">{{ remoteUser?.name || 'Unknown User' }}</h2>
          <p class="status-message">{{ statusMessage }}</p>
        </div>
      </div>

      <!-- Main Call Screen - Show only when connected -->
      <ng-container *ngIf="isCallConnected || !isCaller">
        <app-call-screen 
          [localStream]="localStream"
          [remoteStream]="remoteStream"
          [callType]="callType"
          (end)="onEndCall()">
        </app-call-screen>
      </ng-container>
      <div *ngIf="callDuration" class="duration">
        {{ callDuration }}
      </div>
    </div>
  `,
  styles: [`
    .call-page {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #000;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .duration {
      position: fixed;
      top: 1rem;
      left: 1rem;
      color: white;
      font-size: 1.2rem;
      background: rgba(0,0,0,0.5);
      padding: 0.5rem 1rem;
      border-radius: 1rem;
    }
    .waiting-screen {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: white;
      z-index: 10;
    }
    .user-info .avatar-container {
      position: relative;
      margin-bottom: 1.5rem;
    }
    .user-info .avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .user-info .pulse {
      position: absolute;
      inset: -10px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .user-info .user-name {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .status-message {
      font-size: 1.1rem;
      color: #a0aec0;
    }

    @keyframes pulse {
      0% {
        transform: scale(0.9);
        opacity: 1;
      }
      100% {
        transform: scale(1.3);
        opacity: 0;
      }
    }
  `]
})
export class CallPageComponent implements OnInit, OnDestroy {
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  callType: 'audio' | 'video' | null = null;
  remoteUserId: string = '';
  callId: string = '';
  conversationId: string = '';
  isCaller: boolean = false;
  isCallConnected: boolean = false;
  remoteUser: ChatUser | null = null;
  statusMessage: string = '';

  callStartTime: Date | null = null;
  callDuration: string = '';
  private destroy$ = new Subject<void>();
  private durationInterval: any;
  private callTimeoutHandle: any = null;
  
  constructor(
    // Inject DOCUMENT to safely access window and other browser-specific objects
    // @Inject(DOCUMENT) private document: Document,
    private router: Router,
    private chatService: ChatService,
    private chatSignalrService: ChatSignalrService,
    private notificationService: NotificationService
  ) {
    // Get navigation state
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as any;

    console.log('[CallPage] Constructor - Received state:', state);
    if (state) {
      this.callType = state.callType;
      this.remoteUserId = state.remoteUserId;
      this.callId = state.callId;
      this.conversationId = state.conversationId;
      this.isCaller = !!state.isCaller;

      // Logic for incoming vs outgoing calls
      if (state.isIncoming) {
        this.statusMessage = 'Đang kết nối...';
        // Notify the caller that we are accepting.
        this.chatSignalrService.acceptCall(state.callerId, state.callId);
      } else if (this.isCaller) { // Đây là người gọi
        this.statusMessage = 'Đang gọi...';
      }
    } else {
      // No state, probably a page refresh, navigate back
      console.warn('[CallPage] No state found on navigation, redirecting to /chat');
      this.cleanupAndNavigateBack(false); // Use a dedicated cleanup method
    }
  }

  ngOnInit() {
    console.log('[CallPage] ngOnInit - Initializing...');
    // Lấy thông tin người dùng từ xa để hiển thị avatar/tên một cách đáng tin cậy
    if (this.isCaller && this.remoteUserId) {
      // Use a safer way to get user info, providing a fallback object
      this.remoteUser = this.chatService.getUserByOtherUserId(this.remoteUserId) ?? { 
        id: this.remoteUserId, name: 'Unknown User', avatar: null, 
        active: false, lastMessage: '', time: '' 
      };
    }

    // Set up all listeners immediately to avoid race conditions.
    this.setupSignalRListeners();

    // If I am the caller, start a timeout for no-answer.
    if (this.isCaller) {
      console.log('[CallPage] I am the caller. Starting 20s timeout.');
      this.callTimeoutHandle = setTimeout(() => {
        this.notificationService.show('Không có phản hồi từ người nhận.', 'info');
        this.cleanupAndNavigateBack(true); // End call and notify peer
      }, 20000); // 20 seconds
    }
    
    // Now, initialize media streams.
    this.initializeMedia().catch(err => {
      console.error("Media initialization failed:", err);
      // The error is already handled inside initializeMedia, but we log it here too.
      this.cleanupAndNavigateBack(true); // If media fails, end the call attempt.
    });
  }

  private setupSignalRListeners() {
    console.log('[CallPage] Setting up SignalR listeners...');
    // Listen for the other user accepting the call
    this.chatSignalrService.callAccepted$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => this.onCallAccepted());

    // Listen for the other user rejecting the call
    this.chatSignalrService.callRejected$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => this.onCallRejected());

    // Listen for call end from remote
    this.chatSignalrService.callEnded$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((payload: { fromUserId: string }) => {
      this.notificationService.show('Người dùng đã kết thúc cuộc gọi.', 'info');
      this.cleanupAndNavigateBack(false); // Don't notify peer again
    });
  }

  private async initializeMedia() {
    try {
      const constraints: MediaStreamConstraints = { audio: true, video: this.callType === 'video' };
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      this.notificationService.show('Không thể truy cập micro/camera. Vui lòng kiểm tra quyền.', 'error');
      throw err; // Re-throw to be caught by the caller if needed
    }
  }

  private onCallAccepted() {
    console.log('[CallPage] Event: onCallAccepted fired!');
    // Clear the timeout for the caller as soon as the call is accepted
    this.clearCallTimeout();
    this.isCallConnected = true;
    this.statusMessage = ''; // Clear "Đang gọi..." message
    this.notificationService.show('Cuộc gọi đã được chấp nhận.', 'success');

    // Start call duration timer
    this.callStartTime = new Date();
    this.durationInterval = setInterval(() => {
      if (this.callStartTime) {
        const now = new Date();
        const diff = now.getTime() - this.callStartTime.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        this.callDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }, 1000);

    // TODO: Here you would establish the Peer-to-Peer connection (WebRTC)
    // For now, we just show the local video
  }

  private onCallRejected() {
    console.log('[CallPage] Event: onCallRejected fired!');
    this.notificationService.show('Cuộc gọi đã bị từ chối.', 'warning');
    this.cleanupAndNavigateBack(false); // End the call for the caller, no need to notify peer again
  }

  onEndCall() {
    console.log('[CallPage] User clicked end call button.');
    this.cleanupAndNavigateBack(true); // User clicked end call, so notify peer
  }

  private async cleanupAndNavigateBack(notifyPeer: boolean) {
    console.log(`[CallPage] cleanupAndNavigateBack called. notifyPeer: ${notifyPeer}`);
    this.clearCallTimeout();
    this.stopDurationTimer();

    if (notifyPeer) {
      try {
        console.log(`[CallPage] Invoking EndCall with remoteUserId: ${this.remoteUserId}, callId: ${this.callId}`);
        await this.chatSignalrService.endCall(this.remoteUserId, this.callId);
      } catch {}
    }

    // Log call end message via chat service
    if (this.callStartTime && this.conversationId) { // Only log if call was actually connected
      this.chatService.addMessage(this.conversationId, {
        type: 'text',
        text: "Cuộc gọi đã kết thúc. Thời lượng: " + this.callDuration
      });
    }

    // Clean up local media streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    // Clean up remote media streams
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    // Reset global in-call state
    this.chatSignalrService.setInCallState(false);

    // Safely navigate back to chat, avoiding navigation during construction
    if (this.router.navigated) {
      this.router.navigate(['/chat']);
    }
  }

  private clearCallTimeout() {
    if (this.callTimeoutHandle) {
      clearTimeout(this.callTimeoutHandle);
      this.callTimeoutHandle = null;
    }
  }

  private stopDurationTimer() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupAndNavigateBack(false); // Ensure cleanup on component destruction
  }
}