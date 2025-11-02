import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChatUser } from '../../core/models/chat.models';

export interface AppNotification {
  id: string; // Unique ID for the notification (e.g., messageId)
  senderName: string;
  senderAvatar: string | null;
  messageContent: string;
  conversationId: string;
  timestamp: Date;
  isRead: boolean;
}

const NOTIFICATION_STORAGE_KEY = 'datk-chat-notifications';
const MAX_NOTIFICATIONS = 50; // Store a maximum of 50 notifications in localStorage

@Injectable({
  providedIn: 'root'
})
export class NotificationBellService {
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      if (stored) {
        const notifications: AppNotification[] = JSON.parse(stored).map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp) // Ensure timestamp is a Date object
        }));
        this.notificationsSubject.next(notifications);
        this.updateUnreadCount();
      }
    } catch (e) {
      console.error('Failed to load notifications from localStorage', e);
      this.clearAll();
    }
  }

  private saveToLocalStorage(): void {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(this.notificationsSubject.value));
  }

  private updateUnreadCount(): void {
    const count = this.notificationsSubject.value.filter(n => !n.isRead).length;
    this.unreadCountSubject.next(count);
  }

  public addNotification(notification: Omit<AppNotification, 'isRead'>): void {
    const currentNotifications = this.notificationsSubject.value;

    // Avoid duplicate notifications
    if (currentNotifications.some(n => n.id === notification.id)) {
      return;
    }

    const newNotification: AppNotification = { ...notification, isRead: false };

    const updatedNotifications = [newNotification, ...currentNotifications].slice(0, MAX_NOTIFICATIONS);

    this.notificationsSubject.next(updatedNotifications);
    this.updateUnreadCount();
    this.saveToLocalStorage();
  }

  public markAsRead(notificationId: string): void {
    const notifications = this.notificationsSubject.value;
    const notification = notifications.find(n => n.id === notificationId);
    if (notification && !notification.isRead) {
      notification.isRead = true;
      this.notificationsSubject.next([...notifications]);
      this.updateUnreadCount();
      this.saveToLocalStorage();
    }
  }

  public markAllAsRead(): void {
    const notifications = this.notificationsSubject.value;
    let changed = false;
    notifications.forEach(n => {
      if (!n.isRead) {
        n.isRead = true;
        changed = true;
      }
    });

    if (changed) {
      this.notificationsSubject.next([...notifications]);
      this.updateUnreadCount();
      this.saveToLocalStorage();
    }
  }

  public clearAll(): void {
    this.notificationsSubject.next([]);
    this.unreadCountSubject.next(0);
    localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
  }
}