
import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Message } from '../models/message.model';

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection: signalR.HubConnection | undefined;

  private messageReceivedSubject = new Subject<Message>();
  messageReceived$: Observable<Message> = this.messageReceivedSubject.asObservable();

  private typingSubject = new Subject<{ userId: string, isTyping: boolean }>();
  typing$: Observable<{ userId: string, isTyping: boolean }> = this.typingSubject.asObservable();

  private markAsReadSubject = new Subject<{ userId: string, conversationId: string }>();
  markAsRead$: Observable<{ userId: string, conversationId: string }> = this.markAsReadSubject.asObservable();

  constructor() { }

  public startConnection(): Promise<void> {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5000/chatHub', {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('ReceiveMessage', (message: Message) => {
      this.messageReceivedSubject.next(message);
    });

    this.hubConnection.on('Typing', (userId: string, isTyping: boolean) => {
      this.typingSubject.next({ userId, isTyping });
    });

    this.hubConnection.on('MarkAsRead', (userId: string, conversationId: string) => {
      this.markAsReadSubject.next({ userId, conversationId });
    });

    return this.hubConnection.start()
      .then(() => console.log('SignalR ChatHub connection started'))
      .catch(err => console.log('Error while starting SignalR ChatHub connection: ' + err));
  }

  public stopConnection(): Promise<void> {
    if (this.hubConnection) {
      return this.hubConnection.stop();
    }
    return Promise.resolve();
  }

  public sendMessage(conversationId: string, message: string, type: string, attachments?: string, parentMessageId?: string): Promise<void> {
    if (this.hubConnection) {
      return this.hubConnection.invoke('SendMessage', conversationId, message, type, attachments, parentMessageId);
    }
    return Promise.reject('Hub connection not established.');
  }

  public joinGroup(conversationId: string): Promise<void> {
    if (this.hubConnection) {
      return this.hubConnection.invoke('JoinGroup', conversationId);
    }
    return Promise.reject('Hub connection not established.');
  }

  public leaveGroup(conversationId: string): Promise<void> {
    if (this.hubConnection) {
      return this.hubConnection.invoke('LeaveGroup', conversationId);
    }
    return Promise.reject('Hub connection not established.');
  }

  public sendTypingStatus(conversationId: string, isTyping: boolean): Promise<void> {
    if (this.hubConnection) {
      return this.hubConnection.invoke('Typing', conversationId, isTyping);
    }
    return Promise.reject('Hub connection not established.');
  }

  public sendMarkAsRead(conversationId: string): Promise<void> {
    if (this.hubConnection) {
      return this.hubConnection.invoke('MarkAsRead', conversationId);
    }
    return Promise.reject('Hub connection not established.');
  }
}
