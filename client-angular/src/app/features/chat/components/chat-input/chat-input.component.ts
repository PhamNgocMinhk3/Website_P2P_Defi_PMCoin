import {
  Component,
  EventEmitter,
  Output,
  ViewChild,
  ElementRef,
  HostListener,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { booleanAttribute } from '@angular/core';
import { FormsModule } from '@angular/forms';
// EMOJI IMPORTS...
import {
  EMOJI_DATA,
  EmojiCategory,
} from '../../../../../assets/Emoij/Emoij.Data';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-input.component.html',
  styleUrls: ['./chat-input.component.scss'], // Use a shared style file
})
export class ChatInputComponent {
  @Input() disabled: boolean = false;
  @Input({ transform: booleanAttribute }) isGroup: boolean = false;
  @Input({ transform: booleanAttribute }) isRecording: boolean = false;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput!: ElementRef<HTMLInputElement>;

  @Output() sendMessage = new EventEmitter<string>();
  @Output() sendFile = new EventEmitter<File>();
  @Output() sendImages = new EventEmitter<FileList>();
  @Output() recordAudio = new EventEmitter<void>();
  @Output() openPollModal = new EventEmitter<void>();
  @Output() openGifModal = new EventEmitter<void>();
  @Output() openAppointmentCreator = new EventEmitter<void>();

  newMessage: string = '';
  isActionsPopupVisible = false;
  isEmojiPickerVisible = false;

  // Emoji picker logic
  public emojiData: EmojiCategory[] = EMOJI_DATA;
  public activeEmojiCategoryIndex: number = 0;
  public filteredEmojis: string[] = [];
  private emojiSearchTerm: string = '';

  constructor() {
    this.updateFilteredEmojis();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isActionsPopupVisible = false;
    this.isEmojiPickerVisible = false;
  }

  onSendMessage(): void {
    if (this.newMessage.trim()) {
      this.sendMessage.emit(this.newMessage);
      this.newMessage = '';
    }
  }

  toggleActionsPopup(event: MouseEvent): void {
    event.stopPropagation();
    this.isActionsPopupVisible = !this.isActionsPopupVisible;
    this.isEmojiPickerVisible = false;
  }

  toggleEmojiPicker(event: MouseEvent): void {
    event.stopPropagation();
    this.isEmojiPickerVisible = !this.isEmojiPickerVisible;
    this.isActionsPopupVisible = false;
  }

  triggerFileUpload(): void {
    this.isActionsPopupVisible = false;
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.sendFile.emit(file);
      // Reset input value to allow selecting the same file again
      input.value = '';
    }
  }

  triggerImageUpload(): void {
    this.isActionsPopupVisible = false;
    this.imageInput.nativeElement.click();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.sendImages.emit(files);
      // Reset input value to allow selecting the same files again
      input.value = '';
    }
  }

  selectEmoji(emoji: string): void {
    this.newMessage += emoji;
  }

  // (Include other emoji methods like filterEmojis, updateFilteredEmojis, selectEmojiCategory)
  filterEmojis(event: any): void {
    this.emojiSearchTerm = event.target.value.toLowerCase();
    this.updateFilteredEmojis();
  }

  updateFilteredEmojis(): void {
    const activeCategory = this.emojiData[this.activeEmojiCategoryIndex];
    if (!this.emojiSearchTerm) {
      this.filteredEmojis = activeCategory.emojis;
    } else {
      const allEmojis = this.emojiData.flatMap((cat) => cat.emojis);
      this.filteredEmojis = allEmojis.filter((emoji) =>
        emoji.includes(this.emojiSearchTerm)
      );
    }
  }

  selectEmojiCategory(index: number, event: MouseEvent): void {
    event.stopPropagation();
    this.activeEmojiCategoryIndex = index;
    this.emojiSearchTerm = '';
    const searchInput = (event.currentTarget as HTMLElement)
      .closest('.custom-emoji-picker')
      ?.querySelector('input');
    if (searchInput) searchInput.value = '';
    this.updateFilteredEmojis();
  }
}
