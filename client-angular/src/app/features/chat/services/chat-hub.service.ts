import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ChatMessage } from '../chat.service';

// Các interface cho sự kiện real-time
export interface TypingEvent {
  userId: string;
  conversationId: string;
  isTyping: boolean;
}

export interface MessageReadEvent {
  conversationId: string;
  userId: string;
  messageId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatHubService {
  private hubConnection: signalR.HubConnection | null = null;
  private readonly hubUrl = `${environment.apiUrl}/chatHub`;

  // Trạng thái kết nối
  private connectionStateSubject = new BehaviorSubject<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);
  public connectionState$ = this.connectionStateSubject.asObservable();

  // Subjects cho các sự kiện chat
  private messageReceivedSubject = new Subject<ChatMessage>();
  public messageReceived$ = this.messageReceivedSubject.asObservable();

  private typingSubject = new Subject<TypingEvent>();
  public typing$ = this.typingSubject.asObservable();

  private messageReadSubject = new Subject<MessageReadEvent>();
  public messageRead$ = this.messageReadSubject.asObservable();

  constructor() { }

  public startConnection(): void {
    if (this.hubConnection && this.hubConnection.state !== signalR.HubConnectionState.Disconnected) {
      return;
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, { withCredentials: true })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.hubConnection.onreconnecting(() => this.connectionStateSubject.next(signalR.HubConnectionState.Reconnecting));
    this.hubConnection.onreconnected(() => this.connectionStateSubject.next(signalR.HubConnectionState.Connected));
    this.hubConnection.onclose(() => this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected));

    this.hubConnection.start()
      .then(() => {
        console.log('✅ SignalR Connected successfully to ChatHub');
        this.connectionStateSubject.next(this.hubConnection!.state);
        this.registerChatListeners();
      })
      .catch(err => {
        console.error('❌ ChatHub Connection failed: ', err);
        this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);
        setTimeout(() => this.startConnection(), 5000);
      });
  }

  private registerChatListeners(): void {
    if (!this.hubConnection) return;

    this.hubConnection.on('ReceiveMessage', (message: ChatMessage) => {
      this.messageReceivedSubject.next(message);
    });

    this.hubConnection.on('UserTyping', (typingEvent: TypingEvent) => {
      this.typingSubject.next(typingEvent);
    });

    this.hubConnection.on('MessageRead', (readEvent: MessageReadEvent) => {
      this.messageReadSubject.next(readEvent);
    });

    // Đăng ký các listener khác ở đây (e.g., MemberJoined, ReactionAdded,...)
  }

  // Các method để gọi Hub (ví dụ: sendMessage, joinGroup,...) sẽ được thêm ở đây
}
