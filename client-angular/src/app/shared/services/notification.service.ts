import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Notification {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private notificationSubject = new Subject<Notification | null>();
  public notification$ = this.notificationSubject.asObservable();

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    this.notificationSubject.next({ message, type });

    // Warnings stay longer
    const duration = type === 'warning' ? 5000 : 3000;
    setTimeout(() => {
      this.hide();
    }, duration);
  }

  hide() {
    this.notificationSubject.next(null);
  }
}