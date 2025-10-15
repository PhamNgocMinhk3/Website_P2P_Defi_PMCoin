import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ChatSignalrService {
  private hubConnection: HubConnection;
  private inCallSubject = new BehaviorSubject<boolean>(false);
  public inCall$ = this.inCallSubject.asObservable();

  // Call event subjects
  private incomingCallSubject = new Subject<{
    callerId: string;
    callerName: string;
    type: 'audio' | 'video';
    isGroupCall: boolean;
  }>();
  public incomingCall$ = this.incomingCallSubject.asObservable();

  private callAcceptedSubject = new Subject<{ recipientId: string }>();
  public callAccepted$ = this.callAcceptedSubject.asObservable();

  private callRejectedSubject = new Subject<{ recipientId: string; reason?: string }>();
  public callRejected$ = this.callRejectedSubject.asObservable();

  private callEndedSubject = new Subject<void>();
  public callEnded$ = this.callEndedSubject.asObservable();

  constructor() {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/hubs/chat`)
      .withAutomaticReconnect()
      .build();

    this.setupCallHandlers();
    this.startConnection();
  }

  private async startConnection() {
    try {
      await this.hubConnection.start();
      console.log('Connected to chat hub');
    } catch (err) {
      console.error('Error while establishing connection: ', err);
      // Retry after 5s
      setTimeout(() => this.startConnection(), 5000);
    }
  }

  private setupCallHandlers() {
    // Handle incoming call
    this.hubConnection.on('IncomingCall', (callData: {
      callerId: string;
      callerName: string;
      type: 'audio' | 'video';
      isGroupCall: boolean;
    }) => {
      this.incomingCallSubject.next(callData);
    });

    // Handle call accepted
    this.hubConnection.on('CallAccepted', (data: { recipientId: string }) => {
      this.callAcceptedSubject.next(data);
    });

    // Handle call rejected
    this.hubConnection.on('CallRejected', (data: { recipientId: string; reason?: string }) => {
      this.callRejectedSubject.next(data);
    });

    // Handle call ended
    this.hubConnection.on('CallEnded', () => {
      this.callEndedSubject.next();
    });
  }

  public async initiateCall(params: {
    recipientId: string;
    type: 'audio' | 'video';
    isGroupCall: boolean;
  }) {
    await this.hubConnection.invoke('InitiateCall', params);
    this.inCallSubject.next(true);
  }

  public async acceptCall(params: { callerId: string }) {
    await this.hubConnection.invoke('AcceptCall', params);
    this.inCallSubject.next(true);
  }

  public async rejectCall(params: { recipientId: string; reason?: string }) {
    await this.hubConnection.invoke('RejectCall', params);
  }

  public async endCall(params: { recipientId: string }) {
    await this.hubConnection.invoke('EndCall', params);
    this.inCallSubject.next(false);
  }

  public checkUserBusy(userId: string): Observable<{ error?: boolean; message?: string }> {
    return new Observable(subscriber => {
      this.hubConnection.invoke('CheckUserBusy', { userId })
        .then(result => subscriber.next(result))
        .catch(error => subscriber.error(error))
        .finally(() => subscriber.complete());
    });
  }

  public setInCallState(inCall: boolean) {
    this.inCallSubject.next(inCall);
  }
}