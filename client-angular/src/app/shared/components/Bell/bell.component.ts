import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppNotification, NotificationBellService } from '../../services/notification-bell.service';
import { ChatService } from '../../../features/chat/chat.service';
import { TimeAgoPipe } from './time-ago.pipe';

@Component({
  selector: 'app-bell',
  standalone: true,
  imports: [CommonModule, RouterModule, TimeAgoPipe],
  templateUrl: './bell.component.html',
  styleUrls: ['./bell.component.scss']
})
export class BellComponent implements OnInit, OnDestroy {
  isOpen = false;
  unreadCount = 0;
  notifications: AppNotification[] = [];
  private subscriptions = new Subscription();

  // Display latest 10 notifications in the dropdown
  get displayedNotifications(): AppNotification[] {
    return this.notifications.slice(0, 10);
  }

  constructor(
    private notificationBellService: NotificationBellService,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.notificationBellService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
      })
    );
    this.subscriptions.add(
      this.notificationBellService.notifications$.subscribe(notifications => {
        this.notifications = notifications;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  markAllAsRead(): void {
    this.notificationBellService.markAllAsRead();
  }

  onNotificationClick(notification: AppNotification): void {
    this.notificationBellService.markAsRead(notification.id);
    const conversation = this.chatService.getUserById(notification.conversationId);
    if (conversation) {
      this.chatService.selectUser(conversation);
    }
    this.isOpen = false; // Close dropdown after click
  }
}