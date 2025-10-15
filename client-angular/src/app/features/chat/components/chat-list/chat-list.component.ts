import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, Subscription, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, takeUntil } from 'rxjs/operators';
import { ChatService, ChatUser } from '../../chat.service';
import { UserSearchResult } from '../../../../core/models/chat.models';
import { NicknameService } from '../../nickname.service';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.scss'],
})
export class ChatListComponent implements OnInit, OnDestroy {
  conversations$!: Observable<ChatUser[]>;
  searchResults$!: Observable<ChatUser[]>;
  selectedUser$!: Observable<ChatUser | null>;
  isSearching$!: Observable<boolean>;
  @Output() createGroup = new EventEmitter<void>();

  searchTerm: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  private destroy$ = new Subject<void>();

  constructor(private chatService: ChatService, private nicknameService: NicknameService) {
    this.selectedUser$ = this.chatService.getSelectedUser();
    this.isSearching$ = this.chatService.isSearching$;
  }

  ngOnInit(): void {
    // Lắng nghe cả conversations$ và nicknameUpdates$
    this.conversations$ = combineLatest([
      this.chatService.conversations$,
      this.nicknameService.getNicknameUpdates().pipe(startWith(null)) // startWith để emit giá trị ban đầu
    ]).pipe(
      takeUntil(this.destroy$),
      map(([conversations, nicknameUpdate]: [ChatUser[], any]) => {
        // Sắp xếp lại các cuộc trò chuyện theo tin nhắn mới nhất
        return conversations.sort((a: ChatUser, b: ChatUser) => (b.lastMessageTimestamp?.getTime() || 0) - (a.lastMessageTimestamp?.getTime() || 0));
      })
    );

    this.searchSubscription = this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(term => {
        if (term.trim().length >= 40) {
          this.chatService.performSearch(term);
        } else {
          this.chatService.clearSearchResults();
        }
      });

    this.searchResults$ = this.chatService.searchResults$.pipe(
      map(results => results.map(this.mapSearchResultToChatUser))
    );
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.clearSearchResults(); // Dọn dẹp khi component bị hủy
  }

  onSearchTermChange(term: string): void {
    this.searchSubject.next(term);
  }

  private mapSearchResultToChatUser(result: UserSearchResult): ChatUser {
    return {
      id: result.id,
      name: `${result.firstName} ${result.lastName}`.trim(),
      avatar: result.avatar ?? null,
      active: result.isOnline ?? false, // Hiển thị trạng thái online
      lastMessage: result.username, // Hiển thị username như một thông tin phụ
      time: '',
      isSearchResult: true, // Đánh dấu đây là một kết quả tìm kiếm
    };
  }

  onSelectUser(user: ChatUser): void {
    if (user.isSearchResult) {
      this.chatService.createOrGetOneOnOneConversation(user);
      // Clear search term to hide search results and show the conversation list
      this.searchTerm = '';
    } else {
      this.chatService.selectUser(user);
    }
  }

  onCreateGroup(): void {
    this.createGroup.emit();
  }

  /**
   * FIX: Renamed from `trackByUserConversationId` to `trackByUserId` to match the template.
   * This function is used by `*ngFor` to optimize rendering by tracking items by their unique ID.
   */
  trackByUserId(index: number, user: ChatUser): string {
    return user.id;
  }

  getDisplayName(user: ChatUser): string {
    if (!user) return '';
    // For groups, user.id is the groupId. For 1-on-1, it's conversationId.
    // Nicknames are primarily for group members, but we can try for 1-on-1 as well.
    const nickname = user.isGroup ?
      this.nicknameService.getNickname(user.id, this.chatService.getCurrentSelectedUser()?.id || '') :
      this.nicknameService.getNickname(user.id, user.otherUserId || '');
    return nickname || user.name;
  }
}
