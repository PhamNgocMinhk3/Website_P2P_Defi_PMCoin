import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

// Define interfaces for your data models for better type safety
export interface PriceData {
  // Define the structure of your price data, e.g.
  symbol: string;
  price: number;
  timestamp: Date;
}

export interface UserNotification {
  // Define the structure of your notification data
  type: 'info' | 'warning' | 'error';
  message: string;
}

export interface SessionStateChange {
  state: string;
  data: any; // Or a more specific type
}

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection: signalR.HubConnection | null = null;
  private readonly hubUrl = `${environment.apiUrl}/gameHub`;

  // Connection State
  private connectionStateSubject = new BehaviorSubject<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);
  public connectionState$ = this.connectionStateSubject.asObservable();

  // P2P Order Subjects
  private orderLockedSubject = new Subject<string>();
  public orderLocked$ = this.orderLockedSubject.asObservable();

  private orderUnlockedSubject = new Subject<string>();
  public orderUnlocked$ = this.orderUnlockedSubject.asObservable();

  private orderMatchedSubject = new Subject<string>();
  public orderMatched$ = this.orderMatchedSubject.asObservable();

  // Game related Subjects
  private priceUpdateSubject = new Subject<PriceData>();
  public priceUpdate$ = this.priceUpdateSubject.asObservable();

  private userNotificationSubject = new Subject<UserNotification>();
  public userNotification$ = this.userNotificationSubject.asObservable();

  private sessionStateSubject = new BehaviorSubject<any>(null);
  public sessionState$ = this.sessionStateSubject.asObservable();

  private sessionStateChangeSubject = new Subject<SessionStateChange>();
  public sessionStateChange$ = this.sessionStateChangeSubject.asObservable();

  constructor() {
    this.startConnection();
  }

  private startConnection = () => {
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
        console.log('✅ SignalR Connected successfully to GameHub');
        this.connectionStateSubject.next(this.hubConnection!.state);
        this.registerP2PListeners();
        this.registerGameListeners(); // New method for game listeners
      })
      .catch(err => {
        console.error('❌ SignalR Connection failed: ', err);
        this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);
        // withAutomaticReconnect is configured, so manual restart is likely not needed here
        // unless you want a more aggressive retry strategy on initial failure.
      });
  }

  private registerP2PListeners(): void {
    if (!this.hubConnection) return;

    this.hubConnection.on('OrderLocked', (orderId: string) => {
      console.log(`🔒 Received lock for order: ${orderId}`);
      this.orderLockedSubject.next(orderId);
    });

    this.hubConnection.on('OrderUnlocked', (orderId: string) => {
      console.log(`🔓 Received unlock for order: ${orderId}`);
      this.orderUnlockedSubject.next(orderId);
    });

    this.hubConnection.on('OrderMatched', (orderId: string) => {
      console.log(`✅ Received match confirmation for order: ${orderId}`);
      this.orderMatchedSubject.next(orderId);
    });
  }

  private registerGameListeners(): void {
    if (!this.hubConnection) return;

    this.hubConnection.on('PriceUpdate', (priceData: PriceData) => {
      this.priceUpdateSubject.next(priceData);
    });

    this.hubConnection.on('UserNotification', (notification: UserNotification) => {
      this.userNotificationSubject.next(notification);
    });

    this.hubConnection.on('SessionState', (state: any) => {
      this.sessionStateSubject.next(state);
    });
    
    const handleSessionStateChange = (state: string, data: any) => {
      this.sessionStateChangeSubject.next({state, data});
    };

    this.hubConnection.on('SessionStateChanging', handleSessionStateChange);
    this.hubConnection.on('SessionStateChanged', handleSessionStateChange);
  }

  // Game session methods
  public async joinGameSession(sessionId: string): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      await this.hubConnection.invoke('JoinGameSession', sessionId);
    }
  }

  public async leaveGameSession(sessionId: string): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      await this.hubConnection.invoke('LeaveGameSession', sessionId);
    }
  }

  // P2P Methods to invoke hub
  public async lockOrder(orderId: string): Promise<void> {
    if (this.hubConnection?.state !== signalR.HubConnectionState.Connected) return;
    try {
      await this.hubConnection.invoke('LockOrder', orderId);
    } catch (err) {
      console.error(`Failed to invoke LockOrder for ${orderId}:`, err);
    }
  }

  public async unlockOrder(orderId: string): Promise<void> {
    if (this.hubConnection?.state !== signalR.HubConnectionState.Connected) return;
    try {
      await this.hubConnection.invoke('UnlockOrder', orderId);
    } catch (err) {
      console.error(`Failed to invoke UnlockOrder for ${orderId}:`, err);
    }
  }

  public async notifyTradeSuccess(orderId: string): Promise<void> {
    if (this.hubConnection?.state !== signalR.HubConnectionState.Connected) return;
    try {
      await this.hubConnection.invoke('NotifyTradeSuccess', orderId);
    } catch (err) {
      console.error(`Failed to invoke NotifyTradeSuccess for ${orderId}:`, err);
    }
  }
}