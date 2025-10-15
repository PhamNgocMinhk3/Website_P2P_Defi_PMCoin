import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatUser } from '../../chat.service';

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-header.component.html',
  styleUrls: ['./chat-header.component.scss'],
})
export class ChatHeaderComponent {
  @Input() user: ChatUser | null = null;
  @Input() isOnline: boolean = false;
  @Input() isGroupCall: boolean = false;
  @Output() toggleInfoSidebar = new EventEmitter<void>();
  @Output() openSearchModal = new EventEmitter<void>();
  @Output() startAudioCall = new EventEmitter<void>();
  @Output() startVideoCall = new EventEmitter<void>();
}
