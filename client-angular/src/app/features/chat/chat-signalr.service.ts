import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { ChatMessage, ChatUser } from '../../core/models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatSignalrService {
  private messageReceivedSubject = new Subject<ChatMessage>();
  public messageReceived$ = this.messageReceivedSubject.asObservable();
  private messageDeletedSubject = new Subject<{ chatId: string; messageId: string }>();
  public messageDeleted$ = this.messageDeletedSubject.asObservable();
  private reactionToggledSubject = new Subject<{ messageId: string; userId: string; reaction: string }>();
  public reactionToggled$ = this.reactionToggledSubject.asObservable();
  // Presence Subjects
  private userIsOnlineSubject = new Subject<string>();
  public readonly userIsOnline$ = this.userIsOnlineSubject.asObservable();
  private userIsOfflineSubject = new Subject<{ userId: string, lastSeen: Date }>();
  public readonly userIsOffline$ = this.userIsOfflineSubject.asObservable();
  private initialOnlineUsersSubject = new Subject<string[]>();
  public readonly initialOnlineUsers$ = this.initialOnlineUsersSubject.asObservable();
  private presenceSettingChangedSubject = new Subject<{ userId: string, showOnlineStatus: boolean, isOnline: boolean, lastSeen: Date }>();
  public readonly presenceSettingChanged$ = this.presenceSettingChangedSubject.asObservable();

  // Poll and Appointment Subjects
  private pollUpdatedSubject = new Subject<{ messageId: string; pollData: any }>();
  public pollUpdated$ = this.pollUpdatedSubject.asObservable();
  private appointmentUpdatedSubject = new Subject<{ messageId: string; appointmentData: any }>();
  public appointmentUpdated$ = this.appointmentUpdatedSubject.asObservable();
  // Block/Unblock Subjects
  private userBlockedSubject = new Subject<{ blockerId: string; blockedId: string }>();
  public userBlocked$ = this.userBlockedSubject.asObservable();
  private userUnblockedSubject = new Subject<{ unblockerId: string; unblockedId: string }>();
  public userUnblocked$ = this.userUnblockedSubject.asObservable();
  // Group Management Subjects
  private membersAddedSubject = new Subject<{ conversationId: string; newMemberIds: string[] }>();
  public membersAdded$ = this.membersAddedSubject.asObservable();
  private memberKickedSubject = new Subject<{ conversationId: string; memberId: string }>();
  public memberKicked$ = this.memberKickedSubject.asObservable();
  private memberLeftSubject = new Subject<{ conversationId: string; memberId: string }>();
  public memberLeft$ = this.memberLeftSubject.asObservable();
  private groupSettingsUpdatedSubject = new Subject<{ conversationId: string; settings: any }>();
  public groupSettingsUpdated$ = this.groupSettingsUpdatedSubject.asObservable();
  private groupDisbandedSubject = new Subject<{ conversationId: string }>();
  public groupDisbanded$ = this.groupDisbandedSubject.asObservable();
  private addedToGroupSubject = new Subject<ChatUser>();
  public addedToGroup$ = this.addedToGroupSubject.asObservable();
  private memberRoleChangedSubject = new Subject<{ conversationId: string; memberId: string; role: string; }>();
  public memberRoleChanged$ = this.memberRoleChangedSubject.asObservable();
  private conversationDeletedSubject = new Subject<{ conversationId: string }>();
  public conversationDeleted$ = this.conversationDeletedSubject.asObservable();

  // Call signaling and state
  private incomingCallSubject = new Subject<any>();
  public incomingCall$ = this.incomingCallSubject.asObservable();
  private callAcceptedSubject = new Subject<any>();
  public callAccepted$ = this.callAcceptedSubject.asObservable();
  private callRejectedSubject = new Subject<{ reason?: string }>();
  public callRejected$ = this.callRejectedSubject.asObservable();
  private callEndedSubject = new Subject<any>();
  public callEnded$ = this.callEndedSubject.asObservable();
  
  // Track if user is in a call to prevent multiple calls
  private inCallStateSubject = new BehaviorSubject<boolean>(false);
  public inCallState$ = this.inCallStateSubject.asObservable();
  public setInCallState(inCall: boolean) {
    this.inCallStateSubject.next(inCall);
  }
  public getInCallState(): boolean {
    return this.inCallStateSubject.value;
  }

  private hubConnection: signalR.HubConnection | null = null;
  private presenceConnection: signalR.HubConnection | null = null;
  private readonly hubUrl = `${environment.apiUrl}/chatHub`;
  private readonly presenceUrl = `${environment.apiUrl}/hubs/presence`;

  private connectionStateSubject = new BehaviorSubject<boolean>(false);
  public connectionState$ = this.connectionStateSubject.asObservable();

  constructor(private authService: AuthService) { }

  public startConnection(): void {
    // Kết nối ChatHub sử dụng cookie (withCredentials) như ban đầu
    if (!this.hubConnection || this.hubConnection.state === signalR.HubConnectionState.Disconnected) {
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(this.hubUrl, { withCredentials: true })
        .withAutomaticReconnect()
        .build();
      this.startHub(this.hubConnection, 'ChatHub');
      this.registerChatListeners();
    }

    // Kết nối PresenceHub mới sử dụng JWT token
    this.authService.getJwtToken().subscribe(token => {
      if (!token) {
        console.error('SignalR (Presence) connection failed: No JWT token available.');
        return;
      }

      // Start Presence Hub Connection
      if (!this.presenceConnection || this.presenceConnection.state === signalR.HubConnectionState.Disconnected) {
        this.presenceConnection = this.createConnection(this.presenceUrl, token);
        this.startHub(this.presenceConnection, 'PresenceHub');
        this.registerPresenceListeners();
      }
    });
  }

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
    if (this.presenceConnection) {
      this.presenceConnection.stop();
    }
    this.connectionStateSubject.next(false);
  }

  // This method is now only for token-based connections (PresenceHub)
  private createConnection(url: string, token: string): signalR.HubConnection {
    return new signalR.HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: () => token
      })
      .withAutomaticReconnect()
      .build();
  }

  private startHub(connection: signalR.HubConnection, hubName: string): void {
    connection.start()
      .then(() => {
        console.log(`✅ ${hubName} SignalR Connected`);
        if (hubName === 'ChatHub') {
          this.connectionStateSubject.next(true);
        }
      })
      .catch(err => {
        console.error(`❌ ${hubName} SignalR Connection failed: `, err);
        if (hubName === 'ChatHub') {
          this.connectionStateSubject.next(false);
        }
      });
  }

  private registerChatListeners(): void {
    if (!this.hubConnection) return;

    this.hubConnection.on('ReceiveMessage', (message: ChatMessage) => this.messageReceivedSubject.next(message));
    this.hubConnection.on('MessageDeleted', (payload: { chatId: string, messageId: string }) => this.messageDeletedSubject.next(payload));
    this.hubConnection.on('ReactionToggled', (payload: { messageId: string, userId: string, reaction: string }) => this.reactionToggledSubject.next(payload));
    this.hubConnection.on('PollUpdated', (payload: { messageId: string, pollData: any }) => this.pollUpdatedSubject.next(payload));
    this.hubConnection.on('AppointmentUpdated', (payload: { messageId: string, appointmentData: any }) => this.appointmentUpdatedSubject.next(payload));
    this.hubConnection.on('UserBlocked', (payload: { blockerId: string, blockedId: string }) => this.userBlockedSubject.next(payload));
    this.hubConnection.on('UserUnblocked', (payload: { unblockerId: string, unblockedId: string }) => this.userUnblockedSubject.next(payload));
    this.hubConnection.on('MembersAdded', (payload: { conversationId: string, newMemberIds: string[] }) => this.membersAddedSubject.next(payload));
    this.hubConnection.on('MemberKicked', (payload: { conversationId: string, memberId: string }) => this.memberKickedSubject.next(payload));
    this.hubConnection.on('MemberLeft', (payload: { conversationId: string, memberId: string }) => this.memberLeftSubject.next(payload));
    this.hubConnection.on('AddedToGroup', (newConversation: ChatUser) => this.addedToGroupSubject.next(newConversation));
    this.hubConnection.on('MemberRoleChanged', (payload: { conversationId: string; memberId: string; role: string; }) => this.memberRoleChangedSubject.next(payload));
    this.hubConnection.on('GroupSettingsUpdated', (payload: { conversationId: string, settings: any }) => this.groupSettingsUpdatedSubject.next(payload));
    this.hubConnection.on('GroupDisbanded', (payload: { conversationId: string; }) => this.groupDisbandedSubject.next(payload));
    this.hubConnection.on('ConversationDeleted', (payload: { conversationId: string; }) => this.conversationDeletedSubject.next(payload));

    // Call signaling listeners
    this.hubConnection.on('IncomingCall', (payload: any) => {
      console.log('%c[SIGNALR] Received: IncomingCall', 'color: cyan', payload);
      this.incomingCallSubject.next(payload);
    });
    this.hubConnection.on('CallAccepted', (payload: any) => {
      console.log('%c[SIGNALR] Received: CallAccepted', 'color: lightgreen', payload);
      this.callAcceptedSubject.next(payload);
    });
    this.hubConnection.on('CallRejected', (payload: any) => {
      console.log('%c[SIGNALR] Received: CallRejected', 'color: orange', payload);
      this.callRejectedSubject.next(payload);
    });
    this.hubConnection.on('CallEnded', (payload: any) => {
      console.log('%c[SIGNALR] Received: CallEnded', 'color: red', payload);
      this.callEndedSubject.next(payload);
    });
  }

  private registerPresenceListeners(): void {
    if (!this.presenceConnection) return;

    this.presenceConnection.on('UserIsOnline', (userId: string) => {
      this.userIsOnlineSubject.next(userId);
    });

    this.presenceConnection.on('UserIsOffline', (payload: { userId: string, lastSeen: Date }) => {
      this.userIsOfflineSubject.next(payload);
    });

    this.presenceConnection.on('GetOnlineUsers', (userIds: string[]) => {
      this.initialOnlineUsersSubject.next(userIds);
    });

    // FIX: Move the 'PresenceSettingChanged' listener here, as it's sent from the PresenceHub.
    this.presenceConnection.on('PresenceSettingChanged', (payload: { userId: string, showOnlineStatus: boolean, isOnline: boolean, lastSeen: Date }) => {
      console.log('%c[SIGNALR] Received: PresenceSettingChanged', 'color: purple', payload);
      this.presenceSettingChangedSubject.next(payload);
    });
  }

  public joinChat(chatId: string): Promise<void> | undefined {
    return this.hubConnection?.invoke('JoinChat', chatId);
  }

  // Call signaling invokes
  public callUser(targetUserId: string, callId: string, callType: string, conversationId: string) {
    console.log('%c[SIGNALR] Invoking: CallUser', 'color: cyan', { targetUserId, callId, callType, conversationId });
    return this.hubConnection?.invoke('CallUser', targetUserId, callId, callType, conversationId);
  }

  public acceptCall(callerUserId: string, callId: string) {
    console.log('%c[SIGNALR] Invoking: AcceptCall', 'color: lightgreen', { callerUserId, callId });
    return this.hubConnection?.invoke('AcceptCall', callerUserId, callId);
  }

  public rejectCall(callerUserId: string, callId: string) {
    console.log('%c[SIGNALR] Invoking: RejectCall', 'color: orange', { callerUserId, callId });
    return this.hubConnection?.invoke('RejectCall', callerUserId, callId);
  }

  public endCall(remoteUserId: string, callId: string) {
    console.log('%c[SIGNALR] Invoking: EndCall', 'color: red', { remoteUserId, callId });
    return this.hubConnection?.invoke('EndCall', remoteUserId, callId);
  }

  public leaveChat(chatId: string): Promise<void> | undefined {
    return this.hubConnection?.invoke('LeaveChat', chatId);
  }

  ngOnDestroy(): void {
    this.stopConnection();
  }
}