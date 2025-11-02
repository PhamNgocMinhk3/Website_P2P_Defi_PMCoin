import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage, ChatService, PinnedMessage } from '../../chat.service'; 
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pinned-messages-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pinned-messages-panel.component.html',
  styleUrls: ['./pinned-messages-panel.component.scss'],
})
export class PinnedMessagesPanelComponent implements OnInit, OnDestroy {
  @Input() conversationId!: string;
  @Input() messages: ChatMessage[] = [];
  @Output() scrollToMessage = new EventEmitter<string>();
  @Output() unpinMessage = new EventEmitter<string>();

  pinnedMessages: PinnedMessage[] = [];
  displayMessages: ChatMessage[] = [];
  private subscription = new Subscription();

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    this.loadPinnedMessages();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private loadPinnedMessages(): void {
    // Get pinned messages for current conversation
    this.pinnedMessages = this.chatService
      .getPinnedMessages()
      .filter((pm) => {
        // Find the message in current conversation
        return this.messages.some((msg) => msg.id === pm.message.id);
      })
      .slice(-3); // Keep only last 3 pinned messages

    // Get the actual message objects
    this.displayMessages = this.pinnedMessages
      .map((pm) => this.messages.find((msg) => msg.id === pm.message.id))
      .filter((msg) => msg !== undefined) as ChatMessage[];
  }

  onMessageClick(messageId: string): void {
    this.scrollToMessage.emit(messageId);
  }

  onUnpinClick(messageId: string, event: Event): void {
    event.stopPropagation();
    this.unpinMessage.emit(messageId);
    this.loadPinnedMessages(); // Refresh the list
  }

  getMessagePreview(message: ChatMessage): string {
    switch (message.type) {
      case 'text':
        return (message.text ?? '').length > 50
          ? (message.text ?? '').substring(0, 50) + '...'
          : (message.text ?? '');
      case 'image':
        return '📷 Hình ảnh';
      case 'file':
        return `📎 ${message.fileInfo?.name || 'File'}`;
      case 'audio':
        return '🎵 Tin nhắn thoại';
      case 'poll':
        return `📊 ${message.pollData?.question || 'Poll'}`;
      case 'gif':
        return '🎬 GIF';
      case 'appointment':
        return `📅 ${message.appointmentData?.title || 'Appointment'}`;
      default:
        return 'Tin nhắn';
    }
  }

  formatPinTime(pinnedMessage: PinnedMessage): string {
    const now = new Date();
    const pinTime = new Date(pinnedMessage.pinnedAt);
    const diffInHours = (now.getTime() - pinTime.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Vừa ghim';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} giờ trước`;
    } else if (diffInHours < 48) {
      return 'Hôm qua';
    } else {
      return pinTime.toLocaleDateString('vi-VN');
    }
  }

  getPinnedMessageData(messageId: string): PinnedMessage | undefined {
    return this.pinnedMessages.find((pm) => pm.message.id === messageId);
  }

  getSenderName(message: ChatMessage): string {
    if (message.isOutgoing) return 'Bạn'; 
    return message.senderUsername || 'Unknown';
  }
  // Update when new messages are pinned
  updatePinnedMessages(): void {
    this.loadPinnedMessages();
  }

  trackByMessageId(_index: number, message: ChatMessage): string {
    return message.id;
  }
}
