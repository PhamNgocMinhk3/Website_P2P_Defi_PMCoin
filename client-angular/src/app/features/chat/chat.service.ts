import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, tap, catchError, map, finalize, filter, switchMap, take, merge, takeUntil, throwError, timestamp } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { Appointment, AppointmentMessage, ChatMessage, FileMessage, ImageMessage, GroupMember, PinnedMessage, PollMessage, SharedLink, UserSearchResult, ChatUser } from '../../core/models/chat.models';
export type { Appointment, AppointmentMessage, ChatMessage, FileMessage, ImageMessage, GroupMember, PinnedMessage, PollMessage, SharedLink, UserSearchResult, ChatUser } from '../../core/models/chat.models';
import { NotificationService } from '../../shared/services/notification.service';
import { AuthService, User } from '../../core/services/auth.service';
import { ChatApiService } from './chat-api.service';
import { ChatSignalrService } from './chat-signalr.service';
import { AppNotification, NotificationBellService } from '../../shared/services/notification-bell.service';
import { NicknameService, NicknameUpdate } from './nickname.service';

export type NewMessagePayload =
  | { type: 'text'; text: string }
  | { type: 'image'; imageUrls: string[] }
  | { type: 'file'; fileInfo: { name: string; size: string; type?: string; url?: string } }
  | { type: 'audio'; audioUrl: string }
  | { type: 'text'; text: string }
  | {
      type: 'poll';
      pollData: {
        question: string;
        options: { text: string; votes: number; voters: string[] }[];
      };
    }
  | { type: 'gif'; gifUrl: string }
  | {
      type: 'appointment';
      appointmentData: Appointment;
    };

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy { // Combined class
  // State cho danh sách cuộc trò chuyện (sẽ lấy từ API sau)
  private conversationsSubject = new BehaviorSubject<ChatUser[]>([]);
  public conversations$ = this.conversationsSubject.asObservable();

  // State cho kết quả tìm kiếm
  private searchResultsSubject = new BehaviorSubject<UserSearchResult[]>([]);
  public searchResults$ = this.searchResultsSubject.asObservable();

  private isSearchingSubject = new BehaviorSubject<boolean>(false);
  public isSearching$ = this.isSearchingSubject.asObservable();

  public selectedUser = new BehaviorSubject<ChatUser | null>(null);
  private messagesStore = new Map<string, ChatMessage[]>();
  private messagesUpdated = new Subject<string>(); // Emit userId when messages change
  private sharedLinks: SharedLink[] = [];
  private pinnedMessages: PinnedMessage[] = [];
  private appointments: Appointment[] = [];
  private allUsersCache = new Map<string, ChatUser>();
  private lastJoinedChatId: string | null = null;
  private destroy$ = new Subject<void>();
  private apiUrl = `${environment.apiUrl}/api/chat`; // Base API URL

  private groupMembersUpdatedSubject = new Subject<string>(); // Emits conversationId
  public groupMembersUpdated$ = this.groupMembersUpdatedSubject.asObservable();

  private groupMembersSubject = new BehaviorSubject<GroupMember[]>([]);
  public groupMembers$ = this.groupMembersSubject.asObservable();

  private nicknameUpdatedSubject = new Subject<NicknameUpdate>();
  public nicknameUpdated$ = this.nicknameUpdatedSubject.asObservable();

  public readonly groupSettingsUpdated$: Observable<{ conversationId: string; settings: any; }>;
  public readonly memberLeft$: Observable<{ conversationId: string; memberId: string; }>;
  public readonly groupDisbanded$: Observable<{ conversationId: string; }>;
  public readonly membersAdded$: Observable<{ conversationId: string; newMemberIds: string[]; }>;
  public readonly memberKicked$: Observable<{ conversationId: string; memberId: string; }>;
  public readonly addedToGroup$: Observable<ChatUser>;
  public readonly conversationDeleted$: Observable<{ conversationId: string; }>;
  // Presence Observables
  public readonly userIsOnline$: Observable<string>;
  public readonly userIsOffline$: Observable<{ userId: string, lastSeen: Date }>;
  public readonly initialOnlineUsers$: Observable<string[]>;
  public readonly presenceSettingChanged$: Observable<{ userId: string, showOnlineStatus: boolean, isOnline: boolean, lastSeen: Date }>;

  // Subject để thông báo cho các component khác (như media tab) khi có tin nhắn mới
  private realtimeMessageReceivedSubject = new Subject<ChatMessage>();
  public realtimeMessageReceived$ = this.realtimeMessageReceivedSubject.asObservable();


  constructor(
    private chatApi: ChatApiService,
    private notificationService: NotificationService,
    private authService: AuthService, // Inject AuthService
    private chatSignalrService: ChatSignalrService,
    private http: HttpClient, // Inject HttpClient
    private nicknameService: NicknameService,
    private notificationBellService: NotificationBellService // Inject NotificationBellService
  ) {
    // Initialize SignalR observables here, after chatSignalrService is available
    this.groupSettingsUpdated$ = this.chatSignalrService.groupSettingsUpdated$;
    this.memberLeft$ = this.chatSignalrService.memberLeft$;
    this.groupDisbanded$ = this.chatSignalrService.groupDisbanded$;
    this.membersAdded$ = this.chatSignalrService.membersAdded$;
    this.memberKicked$ = this.chatSignalrService.memberKicked$;
    this.addedToGroup$ = this.chatSignalrService.addedToGroup$;
    this.conversationDeleted$ = this.chatSignalrService.conversationDeleted$;
    // Presence
    this.userIsOnline$ = this.chatSignalrService.userIsOnline$;
    this.userIsOffline$ = this.chatSignalrService.userIsOffline$;
    this.initialOnlineUsers$ = this.chatSignalrService.initialOnlineUsers$;
    this.presenceSettingChanged$ = this.chatSignalrService.presenceSettingChanged$;


    this.loadInitialConversations();
    this.chatSignalrService.startConnection();
    this.listenForRealTimeUpdates();

    // FIX: Listen for nickname updates and automatically reload the member list.
    // This ensures the UI updates in real-time when a nickname is changed.
    this.groupMembersUpdated$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(conversationId => {
      this.loadGroupMembers(conversationId);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadInitialConversations(): void {
    this.chatApi.getConversations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (conversationsFromApi: ChatUser[]) => {
        // Map the DTO from the backend to the ChatUser model used by the frontend.
        const conversations: ChatUser[] = conversationsFromApi.map((conv: any) => {
          const lastMsg = conv.lastMessage;
          return {
            id: conv.id, // This is the conversationId
            otherUserId: conv.otherUserId, // Map a new field
            isBlockedByYou: conv.isBlockedByYou,
            isBlockedByOther: conv.isBlockedByOther,
            firstName: conv.firstName, // <-- FIX: Thêm firstName
            lastName: conv.lastName,   // <-- FIX: Thêm lastName
            name: conv.name,
            avatar: conv.avatar 
              ? (conv.avatar.startsWith('http') ? conv.avatar : `${environment.apiUrl}/${conv.avatar}`)
              : null,
            active: conv.active,
            isGroup: conv.isGroup,
            settings: {
              requireApproval: conv.requireApproval,
              onlyAdminsCanSend: conv.onlyAdminsCanSend,
              allowMemberInvite: conv.allowMemberInvite,
            },
            unreadCount: conv.unreadCount,
            lastMessage: lastMsg ? lastMsg.content : '', // Map content to lastMessage string
            time: lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
            createdAt: new Date(conv.createdAt), // <-- FIX: Add createdAt property and ensure it's a Date
            isOnline: conv.isOnline, // This value is now correctly calculated by the backend.
            showOnlineStatus: conv.showOnlineStatus,
            hasUnreadMessages: conv.unreadCount > 0,
            lastMessageTimestamp: lastMsg ? new Date(lastMsg.createdAt) : undefined
          };
        });
        this.conversationsSubject.next(conversations);
        conversations.forEach(user => this.allUsersCache.set(user.id, user));
      },
      error: (err: any) => {
        this.notificationService.show('Failed to load conversations.', 'error');
        console.error(err);
      }
    });
  }

  // --- SEARCH METHODS ---

  /**
   * @deprecated The component should be updated to use `performSearch` and `searchResults$`.
   * This is a temporary adapter for backward compatibility.
   */
  searchUsers = (term: string) => this.chatApi.searchUsers(term);

  /**
   * Thực hiện tìm kiếm người dùng và cập nhật state.
   * @param term Từ khóa tìm kiếm.
   */
  performSearch(term: string): void {
    this.isSearchingSubject.next(true);
    this.chatApi.searchUsers(term).pipe(
      tap((response: ApiResponse<UserSearchResult[]>) => {
        if (response.success && response.data) {
          this.searchResultsSubject.next(response.data);
        } else {
          // Nếu API trả về success: false, coi như không có kết quả
          this.searchResultsSubject.next([]);
          if (response.message) {
            this.notificationService.show(response.message, 'error');
          }
        }
      }),
      catchError((error: any) => {
        console.error('Search API error:', error);
        this.notificationService.show('Đã có lỗi xảy ra từ máy chủ khi tìm kiếm.', 'error');
        this.searchResultsSubject.next([]); // Xóa kết quả khi có lỗi
        return of(null); // Hoàn thành observable
      }),
      finalize(() => this.isSearchingSubject.next(false)) // Luôn dừng trạng thái loading
    ).pipe(takeUntil(this.destroy$)).subscribe();
  }

  /**
   * Xóa kết quả tìm kiếm.
   */
  clearSearchResults(): void {
    this.searchResultsSubject.next([]);
  }

  /**
   * Creates or retrieves a 1-on-1 conversation and adds it to the conversation list.
   * @param targetUser The user to start a conversation with.
   */
  createOrGetOneOnOneConversation(targetUser: ChatUser): void {
    this.chatApi.createOrGetOneOnOneConversation(targetUser.id).pipe(
      tap((conversation: ChatUser) => {
        if (conversation && conversation.id) {
          const currentConversations = this.conversationsSubject.value;
          const existingConversation = currentConversations.find((c: ChatUser) => c.id === conversation.id);

          if (!existingConversation) {
            // Add new conversation to the top of the list
            this.conversationsSubject.next([conversation, ...currentConversations]);
          }
          // Select the conversation to display it
          this.selectUser(conversation);
          this.clearSearchResults();
        } else {
          this.notificationService.show('Could not start conversation.', 'error');
        }
      }),
      catchError((error: any) => {
        this.notificationService.show('An error occurred while starting the conversation.', 'error');
        return of(null);
      })
    ).pipe(takeUntil(this.destroy$)).subscribe();
  }

  getUserById(id: string): ChatUser | undefined {
    return this.allUsersCache.get(id);
  }

  /**
   * Finds a 1-on-1 conversation user by their actual user ID.
   * @param otherUserId The ID of the user to find.
   * @returns The ChatUser object for the conversation, or undefined if not found.
   */
  getUserByOtherUserId(otherUserId: string): ChatUser | undefined {
    return this.conversationsSubject.value.find(c => !c.isGroup && c.otherUserId === otherUserId);
  }

  getAllUsersFromCache(): ChatUser[] {
    return Array.from(this.allUsersCache.values());
  }

  selectUser(user: ChatUser | null): void {
    if (this.lastJoinedChatId) {
      this.chatSignalrService.leaveChat(this.lastJoinedChatId);
    }

    // --- FIX: LOGIC ĐÁNH DẤU ĐÃ ĐỌC ---
    if (user && user.unreadCount && user.unreadCount > 0) {
      let finalUser = user; // Create a non-nullable variable
      // 1. Cập nhật trạng thái ngay lập tức trên UI
      const currentConversations = this.conversationsSubject.value;
      const conversationIndex = currentConversations.findIndex(c => c.id === finalUser.id);
      if (conversationIndex > -1) {
        const updatedUser = { ...finalUser, unreadCount: 0, hasUnreadMessages: false };
        const newConversations = [...currentConversations];
        newConversations[conversationIndex] = updatedUser;
        this.conversationsSubject.next(newConversations);
        finalUser = updatedUser; // Cập nhật user để truyền đi state mới
      }

      // 2. Gọi API để thông báo cho backend
      this.chatApi.markAsRead(finalUser.id).pipe(take(1)).subscribe();
    }
    // --- KẾT THÚC FIX ---

    this.selectedUser.next(user);
    if (user) {
      // FIX: Wait for the SignalR connection to be established before joining a chat.
      // This prevents the "Cannot send data if the connection is not in the 'Connected' State" error.
      this.chatSignalrService.connectionState$.pipe(
        filter(isConnected => isConnected), // Only proceed if isConnected is true
        take(1) // Take the first true value and then unsubscribe
      ).subscribe(() => {
        if (this.lastJoinedChatId) {
          this.chatSignalrService.leaveChat(this.lastJoinedChatId);
        }
        this.lastJoinedChatId = user.id;
        this.chatSignalrService.joinChat(user.id)?.catch(err => {
          console.error(`Failed to join chat ${user.id}:`, err);
        });
      });
    } else {
      this.lastJoinedChatId = null;
    }
  }

  getSelectedUser(): Observable<ChatUser | null> {
    return this.selectedUser.asObservable();
  }

  getCurrentSelectedUser(): ChatUser | null {
    return this.selectedUser.value;
  }

  // --- MESSAGE METHODS ---
  getMessagesForUser(userId: string): ChatMessage[] {
    return this.messagesStore.get(userId) || [];
  }

  getMessagesObservable(conversationId: string): Observable<ChatMessage[]> {
    const getMessagesFromApi = () =>
      // Use the currentUser$ state from AuthService. This is more robust
      // than making a new HTTP request and ensures we wait for authentication.
      this.authService.currentUser$.pipe(
        filter(user => !!user && !!user.id),
        take(1),
        switchMap(user => {
          const currentUserId = user!.id;
          return this.chatApi.getMessages(conversationId).pipe(
            map((messages: ChatMessage[]) =>
              messages.map(msg => this._processMessageDto(msg, currentUserId))
            ),
            tap(processedMessages => this.messagesStore.set(conversationId, processedMessages))
          );
        })
      );

    // This observable will emit whenever messages for this conversation are updated.
    const updates$ = this.messagesUpdated.pipe(
      filter(updatedId => updatedId === conversationId),
      map(() => this.messagesStore.get(conversationId) || [])
    );

    // Check cache first. If not present, fetch from API. Then, listen for updates.
    const initialData$ = this.messagesStore.has(conversationId)
      ? of(this.messagesStore.get(conversationId)!)
      : getMessagesFromApi();

    return merge(initialData$, updates$);
  }

  addMessage(chatId: string, payload: NewMessagePayload): void {
    this.authService.currentUser$.pipe(
      filter((user): user is NonNullable<typeof user> => !!user && !!user.id),
      take(1)
    ).pipe(takeUntil(this.destroy$)).subscribe(user => {
      const currentUserId = user.id;
      this.chatApi.sendMessage(chatId, payload).subscribe({
        next: (sentMessageDto: ChatMessage) => {
          const processedMessage = this._processMessageDto(sentMessageDto, currentUserId);
          const messages = this.messagesStore.get(chatId) || [];
          messages.push(processedMessage);
          this.messagesStore.set(chatId, messages);
          this.messagesUpdated.next(chatId);
          this._updateConversationList(chatId, processedMessage);
          
          // FIX: Notify subscribers (like media tabs) about the new message from the sender's side.
          this.realtimeMessageReceivedSubject.next(processedMessage);
        },
        error: (err: any) => {
          this.notificationService.show('Failed to send message.', 'error');
          console.error(err);
        }
      });
    });
  }

  private listenForRealTimeUpdates(): void {
    this.authService.currentUser$.pipe(
      filter((user): user is NonNullable<typeof user> => !!user && !!user.id),
      switchMap(user => {
        const currentUserId = user.id;
        // Combine all SignalR listeners into one stream that depends on the user being logged in.
        return merge(
          this.chatSignalrService.messageReceived$.pipe(
            map(messageDto => ({ type: 'messageReceived', payload: this._processMessageDto(messageDto, currentUserId) }))
          ),
          this.chatSignalrService.messageDeleted$.pipe(
            map(payload => ({ type: 'messageDeleted', payload }))
          ),
          this.chatSignalrService.reactionToggled$.pipe(
            map(payload => ({ type: 'reactionToggled', payload }))
          ),
          this.chatSignalrService.pollUpdated$.pipe(
            map(update => ({ type: 'pollUpdated', payload: update }))
          ),
          this.chatSignalrService.appointmentUpdated$.pipe(
            map(update => ({ type: 'appointmentUpdated', payload: update }))
          ),
          this.chatSignalrService.userBlocked$.pipe(
            map(payload => ({ type: 'userBlocked', payload }))
          ),
          this.chatSignalrService.userUnblocked$.pipe(
            map(payload => ({ type: 'userUnblocked', payload }))
          ),
          this.chatSignalrService.membersAdded$.pipe(
            map(payload => ({ type: 'membersAdded', payload }))
          ),
          this.chatSignalrService.addedToGroup$.pipe(
            map(payload => ({ type: 'addedToGroup', payload }))
          ),
          this.chatSignalrService.memberKicked$.pipe(map(payload => ({ type: 'memberKicked', payload }))),
          this.chatSignalrService.memberLeft$.pipe(map(payload => ({ type: 'memberLeft', payload }))),
          this.chatSignalrService.groupSettingsUpdated$.pipe(map(payload => ({ type: 'groupSettingsUpdated', payload }))),
          this.chatSignalrService.memberRoleChanged$.pipe(
            map(payload => ({ type: 'memberRoleChanged', payload }))
          ),
          this.chatSignalrService.groupDisbanded$.pipe(map(payload => ({ type: 'groupDisbanded', payload }))),
          // Presence Events
          this.initialOnlineUsers$.pipe(
            map(userIds => ({ type: 'initialOnlineUsers', payload: userIds }))
          ),
          this.userIsOnline$.pipe(
            map(userId => ({ type: 'userOnline', payload: userId }))
          ),
          this.userIsOffline$.pipe(
            map(payload => ({ type: 'userOffline', payload }))
          ),
          this.presenceSettingChanged$.pipe(
            map(payload => ({ type: 'presenceSettingChanged', payload }))
          ),
          this.conversationDeleted$.pipe(
            map(payload => ({ type: 'conversationDeleted', payload }))
          ),
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe((event: any) => {
      switch (event.type) {
        case 'messageReceived':
          this.handleReceivedMessage(event.payload);
          break;
        case 'messageDeleted':
          this.removeMessageFromStore(event.payload.chatId, event.payload.messageId);
          break;
        case 'reactionToggled':
          this.handleReactionToggled(event.payload);
          break;
        case 'pollUpdated':
          this.updatePollData(event.payload.messageId, event.payload.pollData);
          break;
        case 'appointmentUpdated':
          this.updateAppointmentData(event.payload.messageId, event.payload.appointmentData);
          break;
        case 'userBlocked':
          this.handleUserBlocked(event.payload.blockerId, event.payload.blockedId);
          break;
        case 'userUnblocked':
          this.handleUserUnblocked(event.payload.unblockerId, event.payload.unblockedId);
          break;
        case 'membersAdded':
          this.handleMembersAdded(event.payload.conversationId, event.payload.newMemberIds);
          break;
        case 'addedToGroup':
          this.handleAddedToGroup(event.payload);
          break
        case 'memberLeft':
          this.handleMemberKicked(event.payload.conversationId, event.payload.memberId);
          break;
        case 'memberKicked':
          this.handleMemberKicked(event.payload.conversationId, event.payload.memberId);
          break;
        case 'groupSettingsUpdated':
          this.handleGroupSettingsUpdated(event.payload.conversationId, event.payload.settings);
          break;
        case 'memberRoleChanged':
          this.handleMemberRoleChanged(event.payload.conversationId);
          break;
        case 'groupDisbanded':
          this.handleGroupDisbanded(event.payload.conversationId);
          break;
        case 'initialOnlineUsers':
          this.handleInitialOnlineUsers(event.payload);
          break;
        case 'userOnline':
          this.handleUserPresenceUpdate(event.payload, true);
          break;
        case 'userOffline':
          this.handleUserPresenceUpdate(event.payload.userId, false, new Date(event.payload.lastSeen));
          break;
        case 'presenceSettingChanged':
          this.handlePresenceSettingChanged(event.payload);
          break;
        case 'conversationDeleted':
          this.handleConversationDeleted(event.payload.conversationId);
          break;
      }
    });
  }

  private handleReceivedMessage(message: ChatMessage): void {
    // Avoid adding our own message twice (optimistic vs. real-time)
    if (message.isOutgoing) {
      return;
    }

    const chatId = message.chatId;
    // FIX: Only add the message to the store if the conversation's history is already loaded in memory.
    // This prevents a race condition where a new incoming message creates a tiny message list [message],
    // which then gets displayed, and a moment later the full history is fetched and overwrites it,
    // causing the new message to disappear temporarily.
    if (this.messagesStore.has(chatId)) {
      const messages = this.messagesStore.get(chatId)!;
      messages.push(message);
      this.messagesUpdated.next(chatId);
    }
    this._updateConversationList(chatId, message, true);

    // Thông báo cho các component khác (ví dụ: media tab) về tin nhắn mới
    this.realtimeMessageReceivedSubject.next(message);

    // Create a notification if the user is not currently viewing the chat
    const selectedUser = this.selectedUser.value;
    if (!selectedUser || selectedUser.id !== chatId) {
      const conversation = this.conversationsSubject.value.find(c => c.id === chatId);
      if (conversation) {
        const notification: Omit<AppNotification, 'isRead'> = {
          id: message.id,
          senderName: message.senderUsername,
          senderAvatar: message.senderAvatar,
          messageContent: message.type === 'text' ? message.content : `[${message.type}]`,
          conversationId: chatId,
          timestamp: message.timestamp,
        };
        this.notificationBellService.addNotification(notification);
      }
    }
  }

  private handleReactionToggled({ messageId, userId, reaction }: { messageId: string, userId: string, reaction: string }): void {
    for (const messages of this.messagesStore.values()) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        const updatedMessage = JSON.parse(JSON.stringify(message));
        updatedMessage.reactions = updatedMessage.reactions || {};
        const userHasReactedWithThis = updatedMessage.reactions[reaction]?.includes(userId);

        for (const key in updatedMessage.reactions) {
          updatedMessage.reactions[key] = updatedMessage.reactions[key].filter((u: string) => u !== userId);
          if (updatedMessage.reactions[key].length === 0) {
            delete updatedMessage.reactions[key];
          }
        }

        if (!userHasReactedWithThis) {
          updatedMessage.reactions[reaction] = [...(updatedMessage.reactions[reaction] || []), userId];
        }

        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex > -1) {
          const newMessages = [...messages];
          newMessages[messageIndex] = updatedMessage;
          this.messagesStore.set(message.chatId, newMessages);
          this.messagesUpdated.next(message.chatId);
        }
        return; // Exit after finding and updating the message
      }
    }
  }

  private handleUserBlocked(blockerId: string, blockedId: string): void {
    const currentUser = this.authService.currentUser;
    if (!currentUser) return;
    const currentUserId = currentUser.id;

    const otherUserId = currentUserId === blockerId ? blockedId : blockerId;

    const conversations = this.conversationsSubject.value;
    const conversationIndex = conversations.findIndex(c => c.otherUserId === otherUserId);

    if (conversationIndex > -1) {
      const updatedConversation = { ...conversations[conversationIndex] };
      updatedConversation.isBlockedByYou = blockerId === currentUserId;
      updatedConversation.isBlockedByOther = blockedId === currentUserId;

      conversations[conversationIndex] = updatedConversation;
      this.conversationsSubject.next([...conversations]);

      // If the blocked conversation is currently selected, update it
      const selectedUser = this.selectedUser.value;
      if (selectedUser && selectedUser.otherUserId === otherUserId) {
        this.selectedUser.next(updatedConversation);
      }
      this.notificationService.show('User has been blocked.', 'info');
    }
  }

  private handleUserUnblocked(unblockerId: string, unblockedId: string): void {
    const currentUser = this.authService.currentUser;
    if (!currentUser) return;
    const currentUserId = currentUser.id;

    const otherUserId = currentUserId === unblockerId ? unblockedId : unblockerId;

    const conversations = this.conversationsSubject.value;
    const conversationIndex = conversations.findIndex(c => c.otherUserId === otherUserId);

    if (conversationIndex > -1) {
      const updatedConversation = { ...conversations[conversationIndex] };
      updatedConversation.isBlockedByYou = false;
      updatedConversation.isBlockedByOther = false;

      conversations[conversationIndex] = updatedConversation;
      this.conversationsSubject.next([...conversations]);

      // If the unblocked conversation is currently selected, update it
      const selectedUser = this.selectedUser.value;
      if (selectedUser && selectedUser.otherUserId === otherUserId) {
        this.selectedUser.next(updatedConversation);
      }
      this.notificationService.show('User has been unblocked.', 'success');
    }
  }

  private handleInitialOnlineUsers(userIds: string[]): void {
    const currentConversations = this.conversationsSubject.value;
    let changed = false;
    const updatedConversations = currentConversations.map(conv => {
      // Chỉ cập nhật cho chat 1-1
      if (!conv.isGroup && conv.otherUserId && userIds.includes(conv.otherUserId)) {
        if (!conv.isOnline) {
          changed = true;
          return { ...conv, isOnline: true };
        }
      }
      return conv;
    });

    if (changed) {
      this.conversationsSubject.next(updatedConversations);

      // FIX: Đồng bộ trạng thái online cho selectedUser và groupMembers
      const selected = this.selectedUser.value;
      if (selected && !selected.isGroup && userIds.includes(selected.otherUserId!)) {
        this.selectedUser.next({ ...selected, isOnline: true });
      }

      const currentMembers = this.groupMembersSubject.value;
      if (currentMembers.length > 0) {
        let membersChanged = false;
        const updatedMembers = currentMembers.map(member => {
          if (userIds.includes(member.id) && !member.isOnline) {
            membersChanged = true;
            return { ...member, isOnline: true };
          }
          return member;
        });
        if (membersChanged) {
          this.groupMembersSubject.next(updatedMembers);
        }
      }
    }
  }

  private handleUserPresenceUpdate(userId: string, isOnline: boolean, lastSeen?: Date): void {
    console.log(`[PRESENCE DEBUG] Received update for userId: ${userId}, isOnline: ${isOnline}`, { lastSeen });

    // FIX: Do not process presence updates for the current user.
    // The current user's status is managed by their own connection state.
    if (this.authService.currentUser?.id === userId) {
      return;
    }

    // 1. Cập nhật danh sách cuộc trò chuyện
    const currentConversations = this.conversationsSubject.value;
    const conversationIndex = currentConversations.findIndex(c => !c.isGroup && c.otherUserId === userId);
    if (conversationIndex > -1) {
      console.log('[PRESENCE DEBUG] Found user in conversations list (chat-list).');
      const conversationToUpdate = { ...currentConversations[conversationIndex] };

      // FIX: A user is only "online" if they are connected AND their privacy setting allows it.
      // Offline status is always shown. This prevents incorrect status updates.
      const canShowOnline = isOnline && (conversationToUpdate.showOnlineStatus ?? false);

      // Only update if the state actually changes
      if (conversationToUpdate.isOnline !== canShowOnline || !isOnline) {
        const updatedConversations = [...currentConversations];
        conversationToUpdate.isOnline = canShowOnline;
      if (!isOnline && lastSeen) {
        conversationToUpdate.lastSeen = lastSeen;
        conversationToUpdate.time = new Date(lastSeen).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      }
      updatedConversations[conversationIndex] = conversationToUpdate;
      console.log('[PRESENCE DEBUG] After update (chat-list):', JSON.parse(JSON.stringify(conversationToUpdate)));
      this.conversationsSubject.next(updatedConversations);
      }
    } else {
      console.log('[PRESENCE DEBUG] User not found in conversations list (chat-list).');
    }

    // 2. Cập nhật người dùng đang được chọn (nếu có)
    const selectedUser = this.selectedUser.value;
    if (selectedUser && !selectedUser.isGroup && selectedUser.otherUserId === userId) {
      console.log('[PRESENCE DEBUG] Found user in selectedUser (chat-info).');
      const canShowOnline = isOnline && (selectedUser.showOnlineStatus ?? false);

      if (selectedUser.isOnline !== canShowOnline || !isOnline) {
        console.log('[PRESENCE DEBUG] Before update (selectedUser):', JSON.parse(JSON.stringify(selectedUser)));
        const updatedSelected = { ...selectedUser, isOnline: canShowOnline, lastSeen: lastSeen || selectedUser.lastSeen };
        console.log('[PRESENCE DEBUG] After update (selectedUser):', JSON.parse(JSON.stringify(updatedSelected)));
        this.selectedUser.next(updatedSelected);
      }
    } else {
      console.log(`[PRESENCE DEBUG] User not the selected user. Selected is: ${selectedUser?.otherUserId}, this update is for: ${userId}`);
    }

    // 3. Cập nhật danh sách thành viên của nhóm đang xem
    const currentMembers = this.groupMembersSubject.value;
    if (Array.isArray(currentMembers) && currentMembers.length > 0) {
      const memberIndex = currentMembers.findIndex(m => m.id === userId);
      if (memberIndex > -1) {
        const memberToUpdate = currentMembers[memberIndex];
        const canShowOnline = isOnline && (memberToUpdate.showOnlineStatus ?? false);

        if (memberToUpdate.isOnline !== canShowOnline || !isOnline) {
          console.log('[PRESENCE DEBUG] Found user in group members list (group-chat-info).');
          const updatedMembers = [...currentMembers];
          console.log('[PRESENCE DEBUG] Before update (group member):', JSON.parse(JSON.stringify(memberToUpdate)));
          updatedMembers[memberIndex] = {
            ...memberToUpdate,
            isOnline: canShowOnline,
            lastSeen: lastSeen ?? memberToUpdate.lastSeen
          };
          console.log('[PRESENCE DEBUG] After update (group member):', JSON.parse(JSON.stringify(updatedMembers[memberIndex])));
          this.groupMembersSubject.next(updatedMembers);
        }
      }
    }
  }

  private handlePresenceSettingChanged(payload: { userId: string, showOnlineStatus: boolean, isOnline: boolean, lastSeen: Date }): void {
    const { userId, showOnlineStatus, isOnline, lastSeen } = payload;
    console.log(`[PRESENCE DEBUG] Received setting change for userId: ${userId}`, payload);

    // 1. Cập nhật danh sách cuộc trò chuyện
    const currentConversations = this.conversationsSubject.value;
    const conversationIndex = currentConversations.findIndex(c => !c.isGroup && c.otherUserId === userId);
    if (conversationIndex > -1) {
      const updatedConversations = [...currentConversations];
      let conversationToUpdate = { ...updatedConversations[conversationIndex] };
      conversationToUpdate.showOnlineStatus = showOnlineStatus;
      conversationToUpdate.isOnline = isOnline;
      conversationToUpdate.lastSeen = new Date(lastSeen);
      updatedConversations[conversationIndex] = conversationToUpdate;
      this.conversationsSubject.next(updatedConversations);
    }

    // 2. Cập nhật người dùng đang được chọn (nếu có)
    const selectedUser = this.selectedUser.value;
    if (selectedUser && !selectedUser.isGroup && selectedUser.otherUserId === userId) {
      const updatedSelected = {
        ...selectedUser,
        showOnlineStatus: showOnlineStatus,
        isOnline: isOnline,
        lastSeen: new Date(lastSeen)
      };
      this.selectedUser.next(updatedSelected);
    }

    // 3. Cập nhật danh sách thành viên của nhóm đang xem
    const currentMembers = this.groupMembersSubject.value;
    if (Array.isArray(currentMembers) && currentMembers.length > 0) {
      const memberIndex = currentMembers.findIndex(m => m.id === userId);
      if (memberIndex > -1) {
        const updatedMembers = [...currentMembers];
        updatedMembers[memberIndex] = { ...updatedMembers[memberIndex], showOnlineStatus, isOnline, lastSeen: new Date(lastSeen) };
        this.groupMembersSubject.next(updatedMembers);
      }
    }
  }

  private handleMembersAdded(conversationId: string, newMemberIds?: string[]): void {
    this.notificationService.show('Thành viên đã được thêm vào nhóm!', 'info');
    this.loadGroupMembers(conversationId); // FIX: Refresh member list

    // FIX: Also update the member count on the conversation list
    const conversations = this.conversationsSubject.value;
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation && conversation.memberCount && newMemberIds) {
      conversation.memberCount = (conversation.memberCount || 0) + newMemberIds.length;
    }
  }

  private handleMemberKicked(conversationId: string, kickedMemberId: string): void {
    const currentUser = this.authService.currentUser;
    if (!currentUser) return;

    // Nếu chính người dùng hiện tại bị kick
    if (kickedMemberId === currentUser.id) {
      // Xóa cuộc trò chuyện khỏi danh sách
      const currentConversations = this.conversationsSubject.value;
      const updatedConversations = currentConversations.filter(c => c.id !== conversationId);
      this.conversationsSubject.next(updatedConversations);

      // Nếu đang xem cuộc trò chuyện đó, chuyển về màn hình trống
      if (this.selectedUser.value?.id === conversationId) {
        this.selectUser(null);
      }
      this.notificationService.show('Bạn đã bị xóa khỏi nhóm.', 'warning');
    } else {
      // Nếu người khác bị kick, chỉ cần làm mới danh sách thành viên
      this.notificationService.show('Một thành viên đã bị loại khỏi nhóm.', 'info');
      this.loadGroupMembers(conversationId); // FIX: Refresh member list
    // FIX: Also update the member count on the conversation list
    const conversations = this.conversationsSubject.value;
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation && conversation.memberCount) { conversation.memberCount--; }
    }
  }

  private handleAddedToGroup(newConversation: ChatUser): void {
    const currentConversations = this.conversationsSubject.value;
    const existing = currentConversations.find(c => c.id === newConversation.id);

    if (!existing) {
      // Thêm cuộc trò chuyện mới vào đầu danh sách
      this.conversationsSubject.next([newConversation, ...currentConversations]);
      this.notificationService.show(`Bạn đã được thêm vào nhóm mới: "${newConversation.name}"`, 'info');
    }
  }

  private handleGroupSettingsUpdated(conversationId: string, settings: any): void {
    const conversations = this.conversationsSubject.value;
    const conversationIndex = conversations.findIndex(c => c.id === conversationId);

    if (conversationIndex > -1) {
      const updatedConversation = { ...conversations[conversationIndex] };
      updatedConversation.settings = settings;
      conversations[conversationIndex] = updatedConversation;
      this.conversationsSubject.next([...conversations]);

      const selectedUser = this.selectedUser.value;
      if (selectedUser && selectedUser.id === conversationId) {
        this.selectedUser.next({ ...selectedUser, settings });
      }
      this.notificationService.show('Group settings updated.', 'info');
    }
  }

  private handleMemberRoleChanged(conversationId: string): void {
    this.notificationService.show('Vai trò của một thành viên trong nhóm đã thay đổi.', 'info');
    // Simply reload the member list to reflect the change.
    this.loadGroupMembers(conversationId);
  }

  private handleGroupDisbanded(conversationId: string): void {
    const currentConversations = this.conversationsSubject.value;
    const conversation = currentConversations.find(c => c.id === conversationId);
    if (conversation) {
      const updatedConversations = currentConversations.filter(c => c.id !== conversationId);
      this.conversationsSubject.next(updatedConversations);

      if (this.selectedUser.value?.id === conversationId) {
        this.selectUser(null);
      }

      this.notificationService.show(`Nhóm "${conversation.name}" đã được giải tán.`, 'warning');
    }
  }

  private handleConversationDeleted(conversationId: string): void {
    // Remove the conversation from the main list
    const currentConversations = this.conversationsSubject.value;
    const updatedConversations = currentConversations.filter(c => c.id !== conversationId);
    this.conversationsSubject.next(updatedConversations);

    // If the deleted conversation was selected, unselect it
    if (this.selectedUser.value?.id === conversationId) {
      this.selectUser(null);
    }

    // Clean up message cache
    this.messagesStore.delete(conversationId);
  }

  private handleNicknameUpdated(conversationId: string): void {
    this.notificationService.show('Đã cập nhật biệt danh thành công.', 'success');
    // Re-use the same subject to trigger a refresh of the member list
    this.groupMembersUpdatedSubject.next(conversationId);
  }

  private _updateConversationList(chatId: string, message: ChatMessage, incrementUnread: boolean = false): void {
    const currentConversations = this.conversationsSubject.value;
    const conversationIndex = currentConversations.findIndex((c: ChatUser) => c.id === chatId);
    if (conversationIndex > -1) {
      const updatedConversation = { ...currentConversations[conversationIndex] };
      if (message.type === 'file' && message.fileInfo) {
        updatedConversation.lastMessage = `[File] ${message.fileInfo.name}`;
      } else if (message.type === 'poll' && message.pollData) {
        updatedConversation.lastMessage = `[Poll] ${message.pollData.question}`;
      } else if (message.type === 'appointment' && message.appointmentData) {
        updatedConversation.lastMessage = `[Appointment] ${message.appointmentData.title}`;
      } else if (message.type === 'image') {
        updatedConversation.lastMessage = '[Image]';
      } else if (message.type === 'gif') {
        updatedConversation.lastMessage = '[GIF]';
      } else if (message.type === 'audio') {
        updatedConversation.lastMessage = '[Audio]';
      } else {
        updatedConversation.lastMessage = (message as any).text ?? '';
      }
      updatedConversation.time = new Date(message.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      updatedConversation.lastMessageTimestamp = message.timestamp;

      if (incrementUnread) {
        updatedConversation.unreadCount = (updatedConversation.unreadCount || 0) + 1;
        updatedConversation.hasUnreadMessages = true;
      }

      currentConversations.splice(conversationIndex, 1);
      this.conversationsSubject.next([updatedConversation, ...currentConversations]);
    }
  }

  private _processMessageDto(msg: any, currentUserId: string): ChatMessage {
    msg.isOutgoing = msg.senderId === currentUserId;
    msg.timestamp = new Date(msg.createdAt);

    // ** LOGIC MỚI: Ưu tiên hiển thị biệt danh từ localStorage **
    // Nếu tin nhắn thuộc một group và người gửi có biệt danh đã lưu, ghi đè tên hiển thị.
    if (msg.senderId && msg.chatId) {
      const localNickname = this.nicknameService.getNickname(msg.chatId, msg.senderId);
      if (localNickname) {
        msg.senderUsername = localNickname;
      }
    }

    if (msg.type === 'text') {
      msg.text = msg.content ?? '';
    }

    if (msg.attachments && typeof msg.attachments === 'string') {
      try {
        const parsed = JSON.parse(msg.attachments);
        switch (msg.type) {
          case 'image': msg.imageUrls = parsed.imageUrls; break;
          case 'file': msg.fileInfo = parsed.fileInfo; break;
          case 'audio': msg.audioUrl = parsed.audioUrl; break;
          case 'gif': msg.gifUrl = parsed.gifUrl; break;
        }
      } catch (e) {
        // Not a JSON string, ignore
      }
    }

    if (msg.type === 'appointment' && msg.appointmentData) {
      // Ensure dateTime is a Date object, as it comes as a string from JSON
      if (typeof msg.appointmentData.dateTime === 'string') {
        msg.appointmentData.dateTime = new Date(msg.appointmentData.dateTime);
      }
      // Ensure participants is an array to prevent runtime errors
      if (!msg.appointmentData.participants) {
        msg.appointmentData.participants = [];
      }
      // Ensure createdBy is a valid ChatUser object
      if (!msg.appointmentData.createdBy) {
        // Fallback to message sender if createdBy is missing from appointment data
        const sender = this.getUserById(msg.senderId);
        if (sender) {
          msg.appointmentData.createdBy = sender;
        } else {
          // If sender is not in cache, create a temporary user object.
          msg.appointmentData.createdBy = {
            id: msg.senderId,
            name: msg.senderUsername || 'Unknown User',
            avatar: msg.senderAvatar || null,
            isOnline: msg.senderActive || false,
          } as ChatUser;
        }
      }
    }
    return msg as ChatMessage;
  }

  deleteMessage(chatId: string, messageId: string): void {
    this.chatApi.deleteMessage(messageId).pipe(take(1)).subscribe({
      next: () => {
        this.removeMessageFromStore(chatId, messageId, { message: 'Đã xóa tin nhắn thành công.', type: 'success' });
      },
      error: (err: any) => {
        console.error('Failed to delete message:', err);
        this.notificationService.show('Không thể xóa tin nhắn. Vui lòng thử lại.', 'error');
      }
    });
  }

  private removeMessageFromStore(chatId: string, messageId: string, notificationOptions?: { message: string, type: 'success' | 'info' | 'error' | 'warning' }): void {
    if (this.messagesStore.has(chatId)) {
      let messages = this.messagesStore.get(chatId)!;
      messages = messages.filter((m) => m.id !== messageId);
      this.messagesStore.set(chatId, messages);
      this.messagesUpdated.next(chatId);
      if (notificationOptions) {
        this.notificationService.show(notificationOptions.message, notificationOptions.type);
      }
    }
  }

  toggleReaction(messageId: string, reaction: string): void {
    this.chatApi.toggleReaction(messageId, reaction).pipe(take(1)).subscribe({
      error: (err: any) => {
        console.error('Failed to toggle reaction:', err);
        this.notificationService.show('Không thể gửi cảm xúc.', 'error');
      }
    });
  }

  voteOnPoll(messageId: string, optionIndex: number, pollData: any): void {
    this.authService.currentUser$.pipe(take(1)).pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (!user) {
        this.notificationService.show('You must be logged in to vote.', 'error');
        return;
      }
      // No optimistic update needed here. The backend will broadcast the change via SignalR.
      this.chatApi.voteOnPoll(messageId, optionIndex, pollData).pipe(take(1)).subscribe({
        error: (err) => {
          console.error('Failed to vote on poll:', err);
          this.notificationService.show('Your vote could not be saved. Please try again.', 'error');
        }
      });
    });
  }

  updatePollData(messageId: string, newPollData: any): void {
    for (const messages of this.messagesStore.values()) {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex > -1) {
        const message = messages[messageIndex];
        if (message.type === 'poll') {
          // Create a new object to ensure change detection triggers
          const updatedMessage = { ...message, pollData: newPollData };
          messages[messageIndex] = updatedMessage;
          this.messagesUpdated.next(updatedMessage.chatId);
          return;
        }
      }
    }
  }

  updateAppointmentData(messageId: string, newAppointmentData: Appointment): void {
    for (const messages of this.messagesStore.values()) {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex > -1) {
        const message = messages[messageIndex];
        if (message.type === 'appointment') {
          // Ensure date is a Date object after coming from SignalR
          if (typeof newAppointmentData.dateTime === 'string') {
            newAppointmentData.dateTime = new Date(newAppointmentData.dateTime);
          }
          const updatedMessage = { ...message, appointmentData: newAppointmentData };
          messages[messageIndex] = updatedMessage;
          this.messagesUpdated.next(updatedMessage.chatId);
          return;
        }
      }
    }
  }

  acceptAppointment(messageId: string): void {
    this.chatApi.acceptAppointment(messageId).pipe(take(1)).subscribe({
      error: (err) => {
        console.error('Failed to accept appointment:', err);
        this.notificationService.show('Could not join appointment.', 'error');
      }
    });
  }

  declineAppointment(messageId: string): void {
    this.chatApi.declineAppointment(messageId).pipe(take(1)).subscribe({
      error: (err) => {
        console.error('Failed to decline appointment:', err);
        this.notificationService.show('Could not decline/leave appointment.', 'error');
      }
    });
  }

  addPollOption(messageId: string, optionText: string): void {
    this.chatApi.addPollOption(messageId, optionText).pipe(take(1)).subscribe({
      // No optimistic update needed. The backend will broadcast the change.
      error: (err) => {
        console.error('Failed to add poll option:', err);
        this.notificationService.show(err.error?.message || 'Could not add option.', 'error');
      }
    });
  }

  // --- PINNED MESSAGES ---
  pinMessage(messageId: string, userId: string, conversationId?: string): void {
    const currentUser = this.authService.currentUser;
    if (!currentUser) {
      return;
    }

    const existingPin = this.pinnedMessages.find(
      (p) => p.message.id === messageId
    );
    if (existingPin) {
      return;
    }

    const conversationPins = this.getPinnedMessagesForConversation(
      conversationId || userId
    );

    if (conversationPins.length >= 3) {
      const oldestPin = conversationPins[0];
      this.unpinMessage(oldestPin.message.id);
    }

    const messageToPin = this.findMessageById(messageId);
    if (!messageToPin) {
      return;
    }

    const pinnedMessage: PinnedMessage = {
      message: messageToPin,
      userId: userId,
      pinnedAt: new Date(), 
      pinnedBy: currentUser,
      conversationId: conversationId || userId,
    };
    this.pinnedMessages.push(pinnedMessage);

    for (const messages of this.messagesStore.values()) {
      const message = messages.find((m) => m.id === messageId);
      if (message) {
        message.isPinned = true;
        break;
      }
    }
  }

  unpinMessage(messageId: string): void {
    this.pinnedMessages = this.pinnedMessages.filter((p) => p.message.id !== messageId);

    for (const messages of this.messagesStore.values()) {
      const message = messages.find((m) => m.id === messageId);
      if (message) {
        message.isPinned = false;
        break;
      }
    }
  }

  getPinnedMessages(): PinnedMessage[] {
    return this.pinnedMessages;
  }

  getPinnedMessagesForConversation(conversationId: string): PinnedMessage[] {
    return this.pinnedMessages
      .filter((p) => (p.conversationId ?? p.userId) === conversationId)
      .sort((a, b) => a.pinnedAt.getTime() - b.pinnedAt.getTime());
  }

  // --- SHARED LINKS ---
  addSharedLink(url: string, title: string, conversationId?: string): void {
    const link: SharedLink = {
      id: Date.now(),
      url,
      title,
      timestamp: new Date(),
      conversationId: conversationId,
      isUnsafe: this.checkIfUnsafeLink(url),
    };
    this.sharedLinks.push(link);
  }

  getSharedLinks(): SharedLink[] {
    return this.sharedLinks.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private checkIfUnsafeLink(url: string): boolean {
    const unsafePatterns = [
      /\.exe$/i,
      /\.zip$/i,
      /\.rar$/i,
      /\.dmg$/i,
      /bit\.ly/i,
      /tinyurl/i,
      /suspicious-domain/i,
    ];
    return unsafePatterns.some((pattern) => pattern.test(url));
  }

  // --- APPOINTMENTS ---
  createAppointment(appointment: Omit<Appointment, 'id'>): Appointment {
    const newAppointment: Appointment = {
      ...appointment,
      id: Date.now(),
    };
    this.appointments.push(newAppointment);
    return newAppointment;
  }

  getAppointments(): Appointment[] {
    return this.appointments.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }

  // --- GROUP MANAGEMENT ---
  createGroup(name: string, members: ChatUser[]): Observable<ChatUser> {
    const memberIds = members.map(m => m.id);
    // The backend will send a SignalR event 'AddedToGroup' to all members,
    // including the creator. The 'handleAddedToGroup' method will then add
    // the new group to the conversation list and select it.
    // We no longer need to optimistically update the UI here, as it causes duplication.
    return this.chatApi.createGroup(name, memberIds).pipe(
      tap(newGroup => {
        // We only need to select the new user. The UI update will come from SignalR.
        this.selectUser(newGroup);
      })
    );
  }

  getGroupMembers(conversationId: string): Observable<GroupMember[]> {
    return this.chatApi.getGroupMembers(conversationId).pipe(
      map(members => {
        // ** LOGIC MỚI: Ghi đè biệt danh từ localStorage vào danh sách thành viên **
        return members.map(member => {
          // Cập nhật trạng thái online từ PresenceTracker nếu có
          // (Phần này sẽ được cải thiện khi có state quản lý tập trung hơn)
          // Hiện tại, chúng ta sẽ dựa vào sự kiện real-time để cập nhật

          const localNickname = this.nicknameService.getNickname(conversationId, member.id);
          const nameParts = (member as any).name.split(' '); // Use 'name' from API response
          const lastName = nameParts.pop() || '';
          const firstName = nameParts.join(' ');
          // **FIX**: Đảm bảo tất cả các trường cần thiết được trả về
          return { 
            ...member, 
            firstName: firstName, // Populate firstName
            lastName: lastName,   // Populate lastName
            nickname: localNickname || member.nickname 
          };
        });
      })
    );
  }

  /**
   * Loads members for a specific group and pushes them into the groupMembersSubject.
   * This is called by the component when a group is selected.
   */
  loadGroupMembers(conversationId: string): void {
    this.getGroupMembers(conversationId).pipe(take(1)).subscribe(apiMembers => {
      // FIX: Intelligently merge API data with the most reliable real-time presence state,
      // which is maintained in the main `conversationsSubject`. This prevents race conditions.
      const presenceStateSource = this.conversationsSubject.value;
      const updatedMembers = apiMembers.map(apiMember => {
        // Find the user in the main conversation list to get the most accurate presence status.
        // We look for a 1-on-1 chat with that user to find their status.
        const userInPresenceState = presenceStateSource.find(c => !c.isGroup && c.otherUserId === apiMember.id);
        if (userInPresenceState) {
          // If found, use its real-time status and merge with the member info from the API.
          return { ...apiMember, isOnline: userInPresenceState.isOnline, lastSeen: userInPresenceState.lastSeen };
        }
        // Otherwise, use the data from the API.
        return apiMember;
      });
      this.groupMembersSubject.next(updatedMembers); // Push the intelligently merged list
    });
  }

  /**
   * Clears the group members list, typically when no group is selected.
   */
  clearGroupMembers(): void {
    this.groupMembersSubject.next([]);
  }

  addMembersToGroup(groupId: string, memberIds: string[]): Observable<{ message: string, wasAddedToPending: boolean }> {
    return this.chatApi.addMembersToGroup(groupId, memberIds).pipe(
      tap((response) => {
        // The backend will broadcast SignalR events ('MembersAdded' or 'PendingMemberAdded').
        // The service listens for these and refreshes the member list or notifies admins.
      }),
      catchError(err => {
        // The error is handled in the component, so we just re-throw it.
        return throwError(() => err);
      })
    );
  }

  updateMemberRole(conversationId: string, memberId: string, role: 'admin' | 'member'): Observable<any> {
    return this.chatApi.updateMemberRole(conversationId, memberId, role).pipe(
      // The backend now broadcasts a 'MemberRoleChanged' event, which is handled by 'listenForRealTimeUpdates'.
      // The local refresh is no longer needed here as it's handled centrally.
      catchError(err => {
        this.notificationService.show(err.error?.message || 'Không thể cập nhật vai trò.', 'error');
        return of(null);
      })
    );
  }

  kickMember(conversationId: string, memberId: string): Observable<any> {
    return this.chatApi.kickMember(conversationId, memberId).pipe(
      tap(() => {
        this.notificationService.show('Đã kích thành viên khỏi nhóm.', 'success');
        // The SignalR event 'MemberKicked' will trigger handleMemberKicked, which refreshes the list.
      }),
      catchError(err => {
        this.notificationService.show(err.error?.message || 'Không thể kích thành viên.', 'error');
        return of(null);
      })
    );
  }

  transferOwnership(conversationId: string, newOwnerId: string): Observable<any> {
    return this.chatApi.transferOwnership(conversationId, newOwnerId).pipe(
      tap(() => {
        this.notificationService.show('Đã chuyển quyền trưởng nhóm.', 'success');
        this.loadGroupMembers(conversationId); // Refresh member list to update roles
      }),
      catchError(err => {
        this.notificationService.show(err.error?.message || 'Không thể chuyển quyền.', 'error');
        return of(null);
      })
    );
  }

  setMemberNickname(conversationId: string, memberId: string, nickname: string): Observable<any> {
    // ** LOGIC MỚI: Không gọi API, chỉ lưu vào localStorage và cập nhật UI **
    const trimmedNickname = nickname.trim() || null; // Use null for empty nicknames
    this.nicknameService.setNickname(conversationId, memberId, trimmedNickname || '');

    // Phát tín hiệu để UI (group-chat-info) tự động cập nhật lại danh sách thành viên
    this.handleNicknameUpdated(conversationId);
    // Phát tín hiệu cho các component khác (như chat-list)
    this.nicknameUpdatedSubject.next({ groupId: conversationId, userId: memberId, nickname: trimmedNickname });
    return of({ success: true, message: 'Nickname updated locally.' });
  }

  // --- MESSAGE READ STATUS ---
  markMessageAsRead(messageId: string): void {
    for (const messages of this.messagesStore.values()) {
      const message = messages.find((m) => m.id === messageId);
      if (message) {
        message.isRead = true;
        break;
      }
    }
  }

  markAllMessagesAsRead(userId: string): void {
    const messages = this.messagesStore.get(userId);
    if (messages) {
      messages.forEach((message: ChatMessage) => {
        if (!message.isOutgoing) {
          message.isRead = true;
        }
      });
    }
  }

  // --- MESSAGE SCROLLING ---
  scrollToMessage(messageId: string): void {
    setTimeout(() => { // Use setTimeout to ensure the element is in the DOM
      const messageElement = document.getElementById(`message-${messageId}`);
      if (messageElement) {
        messageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        // Highlight the message temporarily
        messageElement.classList.add('highlighted');
        setTimeout(() => {
          messageElement.classList.remove('highlighted');
        }, 2000);
      }
    }, 100);
  }

  private findMessageById(messageId: string): ChatMessage | undefined {
    for (const messages of this.messagesStore.values()) {
      const message = messages.find((m) => m.id === messageId);
      if (message) return message;
    }
    return undefined;
  }

  // --- ADVANCED OPTIONS ---

  deleteConversation(conversationId: string): Observable<any> {
    return this.chatApi.deleteConversation(conversationId).pipe(
      tap(() => {
        // Xóa cuộc trò chuyện khỏi danh sách state
        const currentConversations = this.conversationsSubject.value;
        this.conversationsSubject.next(currentConversations.filter(c => c.id !== conversationId));

        // Nếu cuộc trò chuyện đang được chọn bị xóa, hãy bỏ chọn nó
        const selected = this.selectedUser.value;
        if (selected && (selected.id === conversationId || (selected as any).conversationId === conversationId)) {
          this.selectUser(null);
        }
        this.notificationService.show('Conversation deleted successfully', 'success');
      })
    );
  }

  blockUser(userId: string): Observable<any> {
    return this.chatApi.blockUser(userId);
  }

  unblockUser(userId: string): Observable<any> {
    return this.chatApi.unblockUser(userId);
  }

  reportUser(userId: string, reason: string, customReason?: string): Observable<any> {
    const payload = { userId, reason, customReason };
    return this.chatApi.reportUser(payload);
  }

  leaveGroup(groupId: string): Observable<any> {
    return this.chatApi.leaveGroup(groupId);
  }

  getPendingMembers(groupId: string): Observable<GroupMember[]> {
    return this.chatApi.getPendingMembers(groupId);
  }

  approvePendingMember(groupId: string, memberId: string): Observable<any> {
    return this.chatApi.approvePendingMember(groupId, memberId);
  }

  rejectPendingMember(groupId: string, memberId: string): Observable<any> {
    return this.chatApi.rejectPendingMember(groupId, memberId);
  }

  updateGroupSettings(groupId: string, settings: any): Observable<any> {
    return this.chatApi.updateGroupSettings(groupId, settings);
  }

  disbandGroup(groupId: string): Observable<any> {
    return this.chatApi.disbandGroup(groupId);
  }
}
