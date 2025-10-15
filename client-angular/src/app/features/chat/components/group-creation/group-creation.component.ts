import {
  Component,
  EventEmitter,
  Output,
  Input,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatUser, ChatService } from '../../chat.service';
import { Subscription, Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, map, catchError, filter } from 'rxjs/operators';

@Component({
  selector: 'app-group-creation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-creation.component.html',
  styleUrls: ['./group-creation.component.scss']
})
export class GroupCreationComponent implements OnInit, OnDestroy {
  @Input() isVisible = false;
  @Input() existingGroupId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() groupCreated = new EventEmitter<{ name: string; members: ChatUser[] }>();
  @Output() membersAdded = new EventEmitter<{ groupId: string; members: ChatUser[] }>();

  availableUsers: ChatUser[] = [];
  selectedUsers: ChatUser[] = [];
  groupName = '';
  searchTerm = '';
  filteredUsers: ChatUser[] = [];
  isSearching = false;

  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  constructor(private chatService: ChatService) {}

  get isAddMemberMode(): boolean {
    return this.existingGroupId !== null;
  }

  ngOnInit(): void {
    this.setupSearch();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
  }

  private setupSearch(): void {
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        if (term.length < 40) {
          this.isSearching = false;
          // Nếu chuỗi tìm kiếm dưới 40 ký tự, trả về mảng rỗng để xóa kết quả
          return of([]);
        }
        this.isSearching = true;
        return this.chatService.searchUsers(term).pipe(
          map(response => {
            if (response.success && response.data) {
              // Map kết quả tìm kiếm sang định dạng ChatUser
              return response.data.map(userResult => ({
                id: userResult.id,
                name: `${userResult.firstName} ${userResult.lastName}`,
                avatar: userResult.avatar,
                active: userResult.isOnline ?? false,
                isOnline: userResult.isOnline,
                lastMessage: '',
                time: '',
              } as ChatUser));
            }
            return [];
          }),
          catchError(() => of([])) // Trả về mảng rỗng nếu có lỗi
        );
      })
    ).subscribe(users => {
      this.isSearching = false;
      this.filteredUsers = users.filter(user => !this.isUserSelected(user));
    });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  toggleUserSelection(user: ChatUser): void {
    const index = this.selectedUsers.findIndex(selected => selected.id === user.id);
    
    if (index > -1) {
      this.selectedUsers.splice(index, 1);
    } else {
      this.selectedUsers.push(user);
    }
    
    // Xóa người dùng đã chọn khỏi danh sách tìm kiếm
    this.filteredUsers = this.filteredUsers.filter(u => u.id !== user.id);
  }

  isUserSelected(user: ChatUser): boolean {
    return this.selectedUsers.some(selected => selected.id === user.id);
  }

  removeSelectedUser(user: ChatUser): void {
    const index = this.selectedUsers.findIndex(selected => selected.id === user.id);
    if (index > -1) {
      this.selectedUsers.splice(index, 1);
      // Khi xóa khỏi danh sách chọn, ta có thể thêm lại vào danh sách tìm kiếm nếu cần
      // Hoặc đơn giản là đợi lần tìm kiếm tiếp theo
    }
  }

  canCreateGroup(): boolean {
    if (this.isAddMemberMode) {
      return this.selectedUsers.length > 0;
    }
    return this.groupName.trim().length > 0 && this.selectedUsers.length >= 1; // Allow creating group with 1 other member (total 2)
  }

  confirmAction(): void {
    if (!this.canCreateGroup()) {
      return;
    }

    if (this.isAddMemberMode && this.existingGroupId) {
      this.membersAdded.emit({
        groupId: this.existingGroupId,
        members: this.selectedUsers,
      });
    } else {
      // Emit the necessary data for the parent component to handle the creation
      this.groupCreated.emit({
        name: this.groupName.trim(),
        members: this.selectedUsers,
      });
    }
  }

  onClose(): void {
    this.resetForm();
    this.close.emit();
  }

  private resetForm(): void {
    this.groupName = '';
    this.selectedUsers = [];
    this.searchTerm = '';
    this.filteredUsers = [];
    this.existingGroupId = null; // Reset mode
    this.searchSubject.next('');
  }

  trackByUserId(index: number, user: ChatUser): string {
    return user.id;
  }
}
