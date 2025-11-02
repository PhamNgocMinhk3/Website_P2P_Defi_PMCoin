import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

// Interfaces for data models for better type safety
export interface PriceData {
  token: string;
  price: number;
  change24h?: number;
  timestamp: Date;
}

export interface SessionStateChange {
  status: string;
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class GameHubService {
  private hubConnection!: signalR.HubConnection;
  private readonly hubUrl = `${environment.apiUrl}/gameHub`;

  // Connection State
  private connectionStateSubject = new BehaviorSubject<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);
  public connectionState$ = this.connectionStateSubject.asObservable();

  // Game related Subjects
  private priceUpdateSubject = new Subject<any>(); // NEW: Subject for price updates
  private sessionStateChangedSubject = new Subject<SessionStateChange>();

  // P2P Order Subjects
  private orderLockedSubject = new Subject<string>();
  public orderLocked$ = this.orderLockedSubject.asObservable();

  private orderUnlockedSubject = new Subject<string>();
  public orderUnlocked$ = this.orderUnlockedSubject.asObservable();

  private orderMatchedSubject = new Subject<string>();
  public orderMatched$ = this.orderMatchedSubject.asObservable();

  public sessionStateChanged$ = this.sessionStateChangedSubject.asObservable();
  public priceUpdate$ = this.priceUpdateSubject.asObservable(); // NEW: Observable for price updates

  constructor() { }


  public async startConnection(): Promise<void> {
    if (this.hubConnection && this.hubConnection.state !== signalR.HubConnectionState.Disconnected) {
      console.log('GameHubService: Connection already active.');
      return;
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, { withCredentials: true })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.hubConnection.onreconnecting(() => this.connectionStateSubject.next(signalR.HubConnectionState.Reconnecting));
    this.hubConnection.onreconnected(() => this.connectionStateSubject.next(signalR.HubConnectionState.Connected));
    this.hubConnection.onclose(() => this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected));

    this.registerListeners();

    try {
      await this.hubConnection.start();
      this.connectionStateSubject.next(this.hubConnection.state);
      console.log('✅ SignalR Connected successfully to GameHub');
    } catch (err) {
      console.error('❌ GameHub Connection failed: ', err);
      this.connectionStateSubject.next(signalR.HubConnectionState.Disconnected);
    }
  }

  private registerListeners(): void {
    // Game Listeners
    this.hubConnection.on('PriceUpdate', (data: PriceData) => {
      this.priceUpdateSubject.next(data);
    });

    this.hubConnection.on('SessionStateChanged', (status: string, data: any) => {
      this.sessionStateChangedSubject.next({ status, data });
    });

    // P2P Listeners
    this.hubConnection.on('OrderLocked', (orderId: string) => this.orderLockedSubject.next(orderId));
    this.hubConnection.on('OrderUnlocked', (orderId: string) => this.orderUnlockedSubject.next(orderId));
    this.hubConnection.on('OrderMatched', (orderId: string) => this.orderMatchedSubject.next(orderId));
  }

  public stopConnection(): void {
    this.hubConnection.stop();
    console.log('SignalR Disconnected.');
  }
}
