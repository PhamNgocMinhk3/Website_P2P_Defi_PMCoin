import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, of, take, merge } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

// Import các thành phần con
import { ChatListComponent } from '../../../features/chat/components/chat-list/chat-list.component';
import { ChatAreaComponent } from '../../../features/chat/components/chat-area/chat-area.component';
import { ChatInfoComponent } from '../../../features/chat/components/chat-info/chat-info.component';
import { GroupChatInfoComponent } from '../../../features/chat/components/group-chat-info/group-chat-info.component';
import { GroupCreationComponent } from '../../../features/chat/components/group-creation/group-creation.component';
import { 
  ChatUser,
  ChatMessage,
  ChatService,
} from '../../../features/chat/chat.service'; 
import { NotificationService } from '../../../shared/services/notification.service';
import { GroupMember } from '../../models/chat.models';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    ChatListComponent,
    ChatAreaComponent,
    ChatInfoComponent,
    GroupChatInfoComponent,
    GroupCreationComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent {
  public isInfoSidebarVisible = false;
  public isGroupCreationVisible = false;
  public selectedUser$: Observable<ChatUser | null>;
  public groupInfo$: Observable<any | null>; // Use 'any' or a defined interface
  public selectedUserMessages$: Observable<ChatMessage[]>;
  public groupMembers$: Observable<GroupMember[]>;
  public currentUserId: string = '';
  public groupIdForAddingMembers: string | null = null;

  // Check if selected user is a group
  get isSelectedUserGroup(): boolean {
    const user = this.chatService.getCurrentSelectedUser();
    return user?.isGroup === true;
  }

  constructor(
    private chatService: ChatService,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    // FIX: Lắng nghe trực tiếp BehaviorSubject để nhận các cập nhật real-time (online/offline)
    // thay vì chỉ lấy giá trị một lần.
    this.selectedUser$ = this.chatService.selectedUser.asObservable();
    this.selectedUser$.subscribe(user => {
      // FIX: When the selected user changes to a group, explicitly load its members.
      // This separates the one-time load from the continuous real-time updates.
      if (user && user.isGroup) {
        this.chatService.loadGroupMembers(user.id);
      } else if (!user) {
        this.chatService.clearGroupMembers();
      }
      console.log('[CHAT COMPONENT] selectedUser$ emitted a new value:', user ? { id: user.id, name: user.name, isOnline: user.isOnline } : null);
    });

    // Get current user ID
    this.authService.currentUser$.pipe(take(1)).subscribe(user => {
      if (user) {
        this.currentUserId = user.id;
      }
    });

    // Create observable that updates when messages change
    this.selectedUserMessages$ = this.selectedUser$.pipe(
      switchMap((user) => {
        if (!user) {
          return of([] as ChatMessage[]);
        }

        // Return observable that emits current messages and updates when messages change
        return this.chatService.getMessagesObservable(user.id);
      })
    );

    // Derive GroupInfo from the selected user
    this.groupInfo$ = this.selectedUser$.pipe(
      map(user => {
        if (user && user.isGroup) {
          return {
            id: user.id,
            name: user.name,
            avatar: user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name.charAt(0))}&background=random&color=fff&size=128`,
            description: 'Group description placeholder', // TODO: Get from backend
            memberCount: 0, // TODO: Get from backend
            createdAt: user.lastMessageTimestamp || new Date(), // Placeholder
            inviteLink: `https://yourapp.com/join/${user.id}`, // Placeholder
            settings: {
              requireApproval: user.settings?.requireApproval ?? false,
              onlyAdminsCanSend: user.settings?.onlyAdminsCanSend ?? false,
              allowMemberInvite: user.settings?.allowMemberInvite ?? false
            }
          };
        }
        return null;
      })
    );

    // FIX: Always listen to the service's groupMembers$ subject.
    // The service is now responsible for loading the correct members into this subject
    // when a group is selected, and for updating it with real-time presence changes.
    this.groupMembers$ = this.chatService.groupMembers$;
  }

  public toggleInfoSidebar(): void {
    this.isInfoSidebarVisible = !this.isInfoSidebarVisible;
  }

  public onCreateGroup(): void {
    this.isGroupCreationVisible = true;
  }

  public closeGroupCreation(): void {
    this.isGroupCreationVisible = false;
  }

  public onGroupCreated(groupData: { name: string, members: ChatUser[] }): void {
    this.chatService.createGroup(groupData.name, groupData.members).subscribe({
      next: (newGroup) => {
        this.notificationService.show(`Group "${newGroup.name}" created successfully!`, 'success');
        this.closeGroupCreation(); // Close the modal on success
      },
      error: (err) => {
        this.notificationService.show(err.error?.message || 'Failed to create group.', 'error');
      }
    });
  }

  public onMembersAdded(event: { groupId: string, members: ChatUser[] }): void {
    const memberIds = event.members.map(m => m.id);
    this.chatService.addMembersToGroup(event.groupId, memberIds).subscribe({
      next: () => {
        this.notificationService.show('Members added successfully!', 'success');
        this.closeGroupCreation();
        // The service should handle updating the member list via SignalR
      },
      error: (err: any) => {
        this.notificationService.show(err.error?.message || 'Failed to add members.', 'error');
      }
    });
  }

  public onDeleteConversation(): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (!user) return;

    this.chatService.deleteConversation(user.id).subscribe({
      next: () => {
        // Service đã tự động cập nhật state, không cần làm gì thêm ở đây.
        // Sidebar sẽ tự đóng vì selectedUser$ sẽ emit null
        this.isInfoSidebarVisible = false;
      },
      error: (err: any) => {
        console.error('Failed to delete conversation', err);
        this.notificationService.show(
          'Failed to delete conversation. Please try again.',
          'error'
        );
      }
    });
  }

  // Group management methods

  public onDisbandGroup(): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user && user.isGroup) {
      this.chatService.disbandGroup(user.id).subscribe({
        next: () => {
          this.notificationService.show('Nhóm đã được giải tán thành công.', 'success');
          this.isInfoSidebarVisible = false; // Close info panel
          // The service will handle removing the conversation from the list
        },
        error: (err: any) => {
          this.notificationService.show(err.error?.message || 'Không thể giải tán nhóm.', 'error');
        }
      });
    }
  }

  public onLeaveGroup(): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user && user.isGroup) {
      this.chatService.leaveGroup(user.id).subscribe({
        next: () => {
          this.notificationService.show('Bạn đã rời nhóm thành công.', 'success');
          this.isInfoSidebarVisible = false; // Close info panel
          // The service will handle removing the conversation from the list
        },
        error: (err: any) => {
          this.notificationService.show(err.error?.message || 'Không thể rời nhóm.', 'error');
        }
      });
    }
  }

  public onKickMember(memberId: string): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user) {
      this.chatService.kickMember(user.id, memberId).subscribe();
    }
  }

  public onPromoteToAdmin(memberId: string): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user) {
      this.chatService.updateMemberRole(user.id, memberId, 'admin').subscribe();
    }
  }

  public onDemoteFromAdmin(memberId: string): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user) {
      this.chatService.updateMemberRole(user.id, memberId, 'member').subscribe();
    }
  }

  public onTransferOwnership(memberId: string): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user) {
      this.chatService.transferOwnership(user.id, memberId).subscribe();
    }
  }

  public onSetNickname(data: { memberId: string; nickname: string }): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user) {
      this.chatService.setMemberNickname(user.id, data.memberId, data.nickname).subscribe();
    }
  }

  public onAddMembers(): void {
    // Re-use the group creation component as a modal to add members.
    // We can enhance group-creation-component later to change its title based on an input property.
    const user = this.chatService.getCurrentSelectedUser();
    if (user && user.isGroup) {
      this.groupIdForAddingMembers = user.id;
      this.isGroupCreationVisible = true;
    }
  }

  public onUpdateGroupSettings(settings: any): void {
    const user = this.chatService.getCurrentSelectedUser();
    if (user && user.isGroup) {
      this.chatService.updateGroupSettings(user.id, settings).subscribe();
    } else {
      this.notificationService.show('Không thể cập nhật cài đặt cho cuộc trò chuyện này.', 'error');
    }
  }

  public onCopyInviteLink(link: string): void {
    navigator.clipboard.writeText(link).then(() => {
      this.notificationService.show('Đã sao chép link mời vào clipboard!', 'success');
    }).catch(err => {
      console.error('Failed to copy invite link: ', err);
      this.notificationService.show('Không thể sao chép link.', 'error');
    });
  }
}
