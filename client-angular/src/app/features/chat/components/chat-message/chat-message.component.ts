import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, booleanAttribute } from '@angular/core';
import { CommonModule, KeyValue } from '@angular/common';
import { Appointment, ChatMessage, ChatUser, ChatService } from '../../chat.service';
import { Observable } from 'rxjs'; // Import Observable

@Component({
  selector: 'app-chat-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-message.component.html',
  styleUrls: [
    '../../../../../styles/components/_chat-message.scss',
    './chat-message.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
  @Input({ required: true }) message!: ChatMessage;
  @Input() currentUser!: ChatUser | null;
  @Input({ transform: booleanAttribute }) showSenderInfo = false;

  selectedUser$: Observable<ChatUser | null>;
  constructor(private chatService: ChatService) {
    this.selectedUser$ = this.chatService.getSelectedUser();
  }

  @Output() vote = new EventEmitter<{
    messageId: string;
    optionIndex: number;
  }>();
  @Output() reactionSelected = new EventEmitter<{ messageId: string; reaction: string }>();
  @Output() forwardMessage = new EventEmitter<string>();
  @Output() deleteMessage = new EventEmitter<string>();
  @Output() markAsRead = new EventEmitter<string>();
  @Output() addPollOption = new EventEmitter<string>();
  @Output() openOptionsMenu = new EventEmitter<{ message: ChatMessage, event: MouseEvent }>();
  @Output() openReactionPicker = new EventEmitter<{ message: ChatMessage, event: MouseEvent }>();

  // File download modal state
  isFileDownloadModalVisible = false;
  selectedFile: { name: string, url: string, size: string } | null = null;

  // Message options menu state
  isOptionsMenuVisible = false;

  // Reaction picker state
  isReactionPickerVisible = false;

  // Helper to preserve original order of keys in *ngFor for reactions
  originalOrder = (a: KeyValue<string, string[]>, b: KeyValue<string, string[]>): number => {
    return 0;
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  getPollPercentage(
    option: { votes: number },
    poll: { options: { votes: number }[] }
  ): number {
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);
    return totalVotes === 0 ? 0 : (option.votes / totalVotes) * 100;
  }

  /**
   * Safely checks if the current user has voted for a specific poll option.
   * @param option The poll option to check.
   */
  isVotedByCurrentUser(option: { voters: string[] }): boolean {
    return !!this.currentUser && option.voters.includes(this.currentUser.id);
  }
  @Output() imageClick = new EventEmitter<{
    imageUrls: string[];
    startIndex: number;
  }>();

  onImageClick(startIndex: number): void {
    if (this.message.type === 'image' && this.message.imageUrls) {
      this.imageClick.emit({
        imageUrls: this.message.imageUrls,
        startIndex: startIndex
      });
    }
  }
  onVote(optionIndex: number): void {
    if (this.message.type === 'poll') {
      this.vote.emit({ messageId: this.message.id, optionIndex });
    }
  }

  onFileClick(): void {
    if (this.message.type === 'file' && this.message.fileInfo?.url) {
      this.selectedFile = {
        name: this.message.fileInfo.name,
        url: this.message.fileInfo.url,
        size: this.message.fileInfo.size
      };
      this.isFileDownloadModalVisible = true;
    }
  }

  closeFileDownloadModal(): void {
    this.isFileDownloadModalVisible = false;
  }

  async downloadFile(): Promise<void> {
    if (!this.selectedFile?.url) return;

    const url = this.selectedFile.url;
    const fileName = this.selectedFile.name;

    // Only use fetch for http/https URLs. Other protocols can't be fetched.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error('Download failed, falling back to direct link:', error);
        window.open(url, '_blank');
      }
    } else {
      // For other protocols (like tcp, mqtt, etc.), try direct download which might navigate.
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName; // This might not work for non-http, but it's the best we can do.
      link.click();
    }

    this.closeFileDownloadModal();
  }

  // Message options menu methods
  toggleOptionsMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isOptionsMenuVisible = !this.isOptionsMenuVisible;
  }

  toggleReactionPicker(event: MouseEvent): void {
    event.stopPropagation();
    this.isReactionPickerVisible = !this.isReactionPickerVisible;
    this.openReactionPicker.emit({ message: this.message, event });
  }

  onSelectReaction(reaction: string): void {
    this.reactionSelected.emit({ messageId: this.message.id, reaction });
    this.isReactionPickerVisible = false; // Close picker after selection
  }

  closeOptionsMenu(): void {
    this.isOptionsMenuVisible = false;
  }

  // Forward message
  onForwardClick(): void {
    this.forwardMessage.emit(this.message.id);
    this.closeOptionsMenu();
  }

  onDeleteClick(): void {
    this.deleteMessage.emit(this.message.id);
    this.closeOptionsMenu();
  }

  formatAppointmentDateTime(dateTime: Date | string): string {
    return new Date(dateTime).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Mark message as read when clicked
  onMessageClick(): void {
    if (!this.message.isRead && !this.message.isOutgoing) {
      this.markAsRead.emit(this.message.id);
    }
  }

  // Add poll option
  onAddPollOption(messageId: string): void {
    this.addPollOption.emit(messageId);
  }

  // --- Appointment Logic ---
  isAppointmentCreator(): boolean {
    if (!this.currentUser || this.message.type !== 'appointment' || !this.message.appointmentData) {
      return false;
    }
    return this.message.appointmentData.createdBy.id === this.currentUser.id;
  }

  hasUserAcceptedAppointment(): boolean {
    if (!this.currentUser || this.message.type !== 'appointment' || !this.message.appointmentData?.participants) {
      return false;
    }
    return this.message.appointmentData.participants.some((p: any) => p.id === this.currentUser!.id);
  }

  hasUserDeclinedAppointment(): boolean {
    if (!this.currentUser || this.message.type !== 'appointment' || !this.message.appointmentData?.declinedBy) {
      return false;
    }
    return this.message.appointmentData.declinedBy.includes(this.currentUser.id);
  }

  onAcceptAppointment(): void {
    this.chatService.acceptAppointment(this.message.id);
  }

  onDeclineOrLeaveAppointment(): void {
    this.chatService.declineAppointment(this.message.id);
  }
}
