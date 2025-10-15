import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import {
  Notification,
  NotificationService,
} from '../../services/notification.service';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.scss'],
})
export class NotificationComponent implements OnInit {
  notification$: Observable<Notification | null>;

  constructor(private notificationService: NotificationService) {
    this.notification$ = this.notificationService.notification$;
  }

  ngOnInit(): void {}

  getNotificationIcon(type: 'success' | 'error' | 'info' | 'warning'): string {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  }

  closeNotification(): void {
    this.notificationService.hide();
  }

  // Keep for backward compatibility
  getIconClass(type: 'success' | 'error' | 'info' | 'warning'): string {
    switch (type) {
      case 'success':
        return 'fa-solid fa-check-circle';
      case 'error':
        return 'fa-solid fa-times-circle';
      case 'warning':
        return 'fa-solid fa-exclamation-triangle';
      case 'info':
        return 'fa-solid fa-info-circle';
    }
  }
}