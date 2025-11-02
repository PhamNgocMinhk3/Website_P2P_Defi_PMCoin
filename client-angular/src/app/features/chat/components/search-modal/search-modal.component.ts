import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMessage, ChatService, ChatUser } from '../../chat.service';

@Component({
  selector: 'app-search-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-modal.component.html',
  styleUrls: ['./search-modal.component.scss'],
})
export class SearchModalComponent implements OnInit {
  @Input() isVisible = false;
  @Input() messages: ChatMessage[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() scrollToMessage = new EventEmitter<string>();

  searchQuery = '';
  searchResults: ChatMessage[] = [];
  isSearching = false;

  private defaultSender: ChatUser = {
    id: '-1', name: 'Unknown', avatar: 'https://st3.depositphotos.com/6672868/13701/v/450/depositphotos_137014128-stock-illustration-user-profile-icon.jpg', active: false, lastMessage: '', time: ''
  };

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    // Focus on search input when modal opens
    if (this.isVisible) {
      setTimeout(() => {
        const searchInput = document.querySelector(
          '.search-input'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }, 100);
    }
  }

  onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }

    this.isSearching = true;
    const query = this.searchQuery.toLowerCase();

    // Simulate search delay for better UX
    setTimeout(() => {
      this.searchResults = this.messages.filter((message) => {
        switch (message.type) {
          case 'text':
            return (message.text ?? '').toLowerCase().includes(query);
          case 'poll':
            return (
              message.pollData?.question.toLowerCase().includes(query) ||
              message.pollData?.options.some((option) =>
                option.text.toLowerCase().includes(query)
              )
            );
          case 'appointment':
            return (
              message.appointmentData?.title.toLowerCase().includes(query) ||
              (message.appointmentData?.description &&
                message.appointmentData?.description
                  .toLowerCase()
                  .includes(query))
            );
          case 'file':
            return !!message.fileInfo?.name.toLowerCase().includes(query);
          default:
            return false;
        }
      });
      this.isSearching = false;
    }, 300);
  }

  onResultClick(messageId: string): void {
    this.scrollToMessage.emit(messageId);
    this.onClose();
  }

  onClose(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.close.emit();
  }

  getMessagePreview(message: ChatMessage): string {
    const maxLength = 100;
    let preview = '';

    switch (message.type) {
      case 'text':
        preview = message.text ?? '';
        break;
      case 'image':
        preview = '📷 Hình ảnh';
        break;
      case 'file':
        preview = `📎 ${message.fileInfo?.name || 'File'}`;
        break;
      case 'audio':
        preview = '🎵 Tin nhắn thoại';
        break;
      case 'poll':
        preview = `📊 ${message.pollData?.question || 'Poll'}`;
        break;
      case 'gif':
        preview = '🎬 GIF';
        break;
      case 'appointment':
        preview = `📅 ${message.appointmentData?.title || 'Appointment'}`;
        break;
      default:
        preview = 'Tin nhắn';
    }

    return preview.length > maxLength
      ? preview.substring(0, maxLength) + '...'
      : preview;
  }

  formatMessageTime(timestamp: Date): string {
    return new Date(timestamp).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  highlightSearchTerm(text: string): string {
    if (!this.searchQuery.trim()) return text;

    const regex = new RegExp(`(${this.searchQuery})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  trackByMessageId(index: number, message: ChatMessage): string {
    return message.id;
  }

  getMessageTypeIcon(type: string): string {
    const icons: { [key: string]: string } = {
      text: 'fas fa-comment',
      image: 'fas fa-image',
      file: 'fas fa-file',
      audio: 'fas fa-microphone',
      poll: 'fas fa-poll',
      gif: 'fas fa-film',
      appointment: 'fas fa-calendar',
    };
    return icons[type] || 'fas fa-comment';
  }

  getMessageTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      text: 'Tin nhắn',
      image: 'Hình ảnh',
      file: 'Tệp tin',
      audio: 'Tin nhắn thoại',
      poll: 'Bình chọn',
      gif: 'GIF',
      appointment: 'Lịch hẹn',
    };
    return labels[type] || 'Tin nhắn';
  }

  getSender(senderId: string | undefined): ChatUser {
    if (senderId === undefined) return this.defaultSender;
    return this.chatService.getUserById(senderId) || this.defaultSender;
  }
}
