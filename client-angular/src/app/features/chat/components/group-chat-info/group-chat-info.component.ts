import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, SimpleChanges, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, filter, take } from 'rxjs/operators';

import { ChatService, ChatUser, GroupMember, ChatMessage } from '../../chat.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { MediaService } from '../../media.service'; // Correct path might be needed
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { SharedFile, SharedImage } from '../../../../core/models/chat.models';

// FIX: Define missing types locally as they are not in chat.models.ts
// FIX: Extend from SharedImage to ensure compatibility
export interface ImageAttachment extends SharedImage {
  // No new properties needed for now
}

// FIX: Extend from SharedFile to ensure compatibility
export interface FileAttachment extends SharedFile {
  sender: string; // FIX: sender must be a string to be compatible with SharedFile
}

@Component({
  selector: 'app-group-chat-info',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageViewerComponent],
  templateUrl: './group-chat-info.component.html',
  styleUrls: ['./group-chat-info.component.scss']
})
export class GroupChatInfoComponent implements OnInit, OnDestroy, OnChanges {
  @Input() groupInfo: ChatUser | null = null;
  @Input() currentUserId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() kickMember = new EventEmitter<string>();
  @Output() promoteToAdmin = new EventEmitter<string>();
  @Output() demoteFromAdmin = new EventEmitter<string>();
  @Output() transferOwnership = new EventEmitter<string>();
  @Output() setNickname = new EventEmitter<{ memberId: string; nickname: string }>();
  @Output() addMembers = new EventEmitter<void>();
  @Output() updateGroupSettings = new EventEmitter<any>();
  @Output() leaveGroup = new EventEmitter<void>();
  @Output() disbandGroup = new EventEmitter<void>();
  @Output() copyInviteLink = new EventEmitter<string>();

  activeTab: 'members' | 'settings' | 'media' = 'members';
  members: GroupMember[] = [];
  filteredMembers: GroupMember[] = [];
  searchTerm = '';
  showOnlineOnly = false;

  // Media
  sharedImages: ImageAttachment[] = [];
  sharedFiles: FileAttachment[] = [];
  imageViewerImages: string[] = []; // FIX: ImageViewer expects an array of strings (URLs)
  isImageViewerVisible = false;
  imageViewerCurrentIndex = 0;

  // Modals
  isPendingMembersModalVisible = false;
  isLeaveModalVisible = false;
  isDisbandModalVisible = false;
  isFileDownloadModalVisible = false;
  isKickModalVisible = false;
  isTransferOwnershipModalVisible = false;
  isMemberActionsModalVisible = false;

  // Editing states
  isEditingGroupName = false;
  editedGroupName = '';
  isEditingDescription = false;
  editedDescription = '';

  // Placeholders for other properties
  isAdminOrOwner = false;
  isOwner = false;
  canInvite = false;
  pendingMembers: GroupMember[] = [];
  selectedFile: FileAttachment | null = null;
  selectedMember: GroupMember | null = null;
  selectedMemberForActions: GroupMember | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private chatService: ChatService,
    private notificationService: NotificationService,
    public mediaService: MediaService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Lắng nghe danh sách thành viên từ service
    this.chatService.groupMembers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(members => {
        this.members = members;
        this.applyFilters(); // Cập nhật danh sách hiển thị

        // FIX: Recalculate permissions whenever the member list updates.
        // This resolves the race condition where permissions were checked before members were loaded on refresh.
        const currentUserMember = this.members.find(m => m.id === this.currentUserId);
        if (currentUserMember) {
          this.isOwner = currentUserMember.role === 'owner';
          this.isAdminOrOwner = this.isOwner || currentUserMember.role === 'admin';
        } else {
          this.isOwner = false;
          this.isAdminOrOwner = false;
        }

        // FIX: Calculate canInvite permission based on role and group settings.
        this.canInvite = this.isAdminOrOwner || (this.groupInfo?.settings?.allowMemberInvite ?? false);

        this.cdr.markForCheck();
      });

    this.listenForRealtimeMedia();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['groupInfo'] && this.groupInfo) {
      // FIX: Also update canInvite when groupInfo (which contains settings) changes.
      this.canInvite = this.isAdminOrOwner || (this.groupInfo?.settings?.allowMemberInvite ?? false);
      this.loadInitialData();
    }
    // Khi các thuộc tính lọc thay đổi, áp dụng lại bộ lọc
    if (changes['searchTerm'] || changes['showOnlineOnly']) {
      this.applyFilters();
    }
  }

  private loadInitialData(): void {
    if (!this.groupInfo) return;

    // Reset states
    this.activeTab = 'members';
    this.sharedImages = [];
    this.sharedFiles = [];

    // The permission check is now handled in the groupMembers$ subscription.
    // FIX: Load initial messages only ONCE to populate media tab.
    // Subsequent updates will be handled by the realtime listener.
    this.chatService.getMessagesObservable(this.groupInfo.id)
      .pipe(take(1)) // Use take(1) to get the current list and then unsubscribe.
      .subscribe((messages: ChatMessage[]) => {
        this.populateMedia(messages);
        this.cdr.markForCheck(); // Use markForCheck for better performance
      });
  }

  private populateMedia(messages: ChatMessage[]): void {
    this.sharedImages = [];
    this.sharedFiles = [];
    messages.forEach(msg => {
      if (msg.type === 'image' && msg.imageUrls) {
        msg.imageUrls.forEach(url => {
          this.sharedImages.push({ url: url, name: 'Image', messageId: msg.id, sender: msg.senderUsername || 'Unknown', date: msg.timestamp, type: 'image' });
        });
      } else if (msg.type === 'file' && msg.fileInfo) {
        this.sharedFiles.push({
          ...msg.fileInfo,
          url: msg.fileInfo.url || '', // FIX: Provide a fallback for url
          type: msg.fileInfo.type || '', // FIX: Provide a fallback for type
          sender: msg.senderUsername || 'Unknown', // FIX: Provide a fallback for sender
          messageId: msg.id, // FIX: Add missing property
          date: msg.timestamp // FIX: Add missing property
        });
      }
    });
    // Sort newest first
    this.sharedImages.reverse();
    this.sharedFiles.reverse();
  }

  private listenForRealtimeMedia(): void {
    this.chatService.realtimeMessageReceived$
      .pipe(
        filter(message => message.chatId === this.groupInfo?.id),
        takeUntil(this.destroy$)
      )
      .subscribe(newMessage => {
        let mediaAdded = false;
        if (newMessage.type === 'image' && newMessage.imageUrls) {
          newMessage.imageUrls.forEach(url => {
            // Add to the beginning of the array to show newest first
            this.sharedImages.unshift({ url: url, name: 'Image', messageId: newMessage.id, sender: newMessage.senderUsername || 'Unknown', date: newMessage.timestamp, type: 'image' });
          });
          mediaAdded = true;
        } else if (newMessage.type === 'file' && newMessage.fileInfo) {
          this.sharedFiles.unshift({
            ...newMessage.fileInfo,
            url: newMessage.fileInfo.url || '', // FIX: Provide a fallback for url
            type: newMessage.fileInfo.type || '', // FIX: Provide a fallback for type
            sender: newMessage.senderUsername || 'Unknown', // FIX: Provide a fallback for sender
            messageId: newMessage.id, // FIX: Add missing property
            date: newMessage.timestamp // FIX: Add missing property
          });
          mediaAdded = true;
        }

        if (mediaAdded) {
          // Trigger change detection to update the view
          this.cdr.detectChanges();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public applyFilters(): void {
    let filtered = this.members;

    if (this.showOnlineOnly) {
      filtered = filtered.filter(member => member.isOnline);
    }

    if (this.searchTerm) {
      const lowerCaseSearchTerm = this.searchTerm.toLowerCase();
      filtered = filtered.filter(member => member.name.toLowerCase().includes(lowerCaseSearchTerm) || member.nickname?.toLowerCase().includes(lowerCaseSearchTerm));
    }

    this.filteredMembers = filtered;
  }

  // --- Mock/Placeholder methods based on HTML ---
  onClose(): void { this.close.emit(); }
  switchTab(tab: 'members' | 'settings' | 'media'): void { this.activeTab = tab; }
  startEditingGroupName(): void { /* Logic to start editing */ }
  saveGroupName(): void { /* Logic to save name */ }
  cancelEditingGroupName(): void { /* Logic to cancel editing */ }
  startEditingDescription(): void { /* Logic to start editing */ }
  saveDescription(): void { /* Logic to save description */ }
  cancelEditingDescription(): void { /* Logic to cancel editing */ }
  onAddMembers(): void { this.addMembers.emit(); }
  getRoleDisplayName(role: any): string { return role; }
  formatLastSeen(date: any): string { return new Date(date).toLocaleTimeString(); }
  openMemberActionsModal(member: GroupMember): void {
    this.selectedMemberForActions = member;
    this.isMemberActionsModalVisible = true;
  }
  toggleRequireApproval(): void {
    if (!this.groupInfo?.settings) return;
    const newSettings = { ...this.groupInfo.settings, requireApproval: !this.groupInfo.settings.requireApproval };
    this.updateGroupSettings.emit(newSettings);
  }
  openPendingMembersModal(): void { // Already implemented
    if (!this.groupInfo) return;
    this.chatService.getPendingMembers(this.groupInfo.id)
      .pipe(take(1))
      .subscribe(members => {
        this.pendingMembers = members;
        this.isPendingMembersModalVisible = true;
        this.cdr.markForCheck();
      });
  }
  toggleOnlyAdminsCanSend(): void {
    if (!this.groupInfo?.settings) return;
    const newSettings = { ...this.groupInfo.settings, onlyAdminsCanSend: !this.groupInfo.settings.onlyAdminsCanSend };
    this.updateGroupSettings.emit(newSettings);
  }
  toggleAllowMemberInvite(): void {
    if (!this.groupInfo?.settings) return;
    const newSettings = { ...this.groupInfo.settings, allowMemberInvite: !this.groupInfo.settings.allowMemberInvite };
    this.updateGroupSettings.emit(newSettings);
  }
  openLeaveModal(): void { this.isLeaveModalVisible = true; } // FIX: Set the flag to true
  openDisbandModal(): void { this.isDisbandModalVisible = true; } // FIX: Set the flag to true
  openImageViewer(index: number): void { 
    this.imageViewerImages = this.sharedImages.map(img => img.url);
    this.imageViewerCurrentIndex = index;
    this.isImageViewerVisible = true;
  }
  openFileDownloadModal(file: FileAttachment): void {
    this.selectedFile = file;
    this.isFileDownloadModalVisible = true;
  }
  closePendingMembersModal(): void { 
    this.isPendingMembersModalVisible = false;
    this.pendingMembers = [];
  }
  approveMember(memberId: string): void {
    if (!this.groupInfo) return;
    this.chatService.approvePendingMember(this.groupInfo.id, memberId).subscribe(() => {
      this.notificationService.show('Đã phê duyệt thành viên.', 'success');
      this.pendingMembers = this.pendingMembers.filter(m => m.id !== memberId); // Remove from list
    });
  }
  rejectMember(memberId: string): void {
    if (!this.groupInfo) return;
    this.chatService.rejectPendingMember(this.groupInfo.id, memberId).subscribe(() => {
      this.notificationService.show('Đã từ chối thành viên.', 'info');
      this.pendingMembers = this.pendingMembers.filter(m => m.id !== memberId); // Remove from list
    });
  }
  closeLeaveModal(): void { 
    this.isLeaveModalVisible = false;
  }
  confirmLeave(): void { this.leaveGroup.emit(); this.closeLeaveModal(); }
  closeDisbandModal(): void { 
    this.isDisbandModalVisible = false;
  }
  confirmDisband(): void { this.disbandGroup.emit(); this.closeDisbandModal(); }
  closeImageViewer(): void { this.isImageViewerVisible = false; }
  onImageViewerIndexChange(index: number): void { this.imageViewerCurrentIndex = index; }
  closeFileDownloadModal(): void {
    this.isFileDownloadModalVisible = false;
    this.selectedFile = null;
  }
  downloadFile(): void {
    if (!this.selectedFile) {
      this.notificationService.show('Không tìm thấy đường dẫn file.', 'error');
      return;
    }
    this.notificationService.show(`Đang tải xuống ${this.selectedFile.name}...`, 'info');
    this.mediaService.downloadFile(this.selectedFile);
    this.closeFileDownloadModal();
  }
  closeKickModal(): void { 
    this.isKickModalVisible = false;
    this.selectedMember = null;
  }
  confirmKick(): void { if (this.selectedMember) this.kickMember.emit(this.selectedMember.id); this.closeKickModal(); this.closeMemberActionsModal(); }
  closeTransferOwnershipModal(): void { 
    this.isTransferOwnershipModalVisible = false;
    this.selectedMember = null;
  }
  confirmTransferOwnership(): void { if (this.selectedMember) this.transferOwnership.emit(this.selectedMember.id); this.closeTransferOwnershipModal(); this.closeMemberActionsModal(); }
  closeMemberActionsModal(): void {
    this.isMemberActionsModalVisible = false;
    this.selectedMemberForActions = null;
  }
  setMemberNickname(member: GroupMember): void { 
    const newNickname = prompt('Enter new nickname:', member.nickname || ''); 
    if (newNickname !== null) {
      this.setNickname.emit({ memberId: member.id, nickname: newNickname }); 
    }
    this.closeMemberActionsModal();
  }
  canPromoteToAdmin(member: GroupMember): boolean { 
    return this.isOwner && member.role === 'member';
  }
  promoteToAdminAction(member: GroupMember): void { 
    this.promoteToAdmin.emit(member.id); 
    this.closeMemberActionsModal();
  }
  canDemoteFromAdmin(member: GroupMember): boolean { 
    return this.isOwner && member.role === 'admin';
  }
  demoteFromAdminAction(member: GroupMember): void { 
    // FIX: Correctly emit the demoteFromAdmin event instead of promoteToAdmin
    this.demoteFromAdmin.emit(member.id);
    this.closeMemberActionsModal();
  }
  canTransferOwnership(member: GroupMember): boolean { 
    // FIX: An owner can transfer ownership to ANY other member, not just an admin.
    return this.isOwner && member.role !== 'owner';
  }
  openTransferOwnershipModal(member: GroupMember): void { 
    this.selectedMember = member;
    this.isTransferOwnershipModalVisible = true;
  }
  canKickMember(member: GroupMember): boolean { 
    return this.isAdminOrOwner && member.role !== 'owner' && (this.isOwner || member.role !== 'admin');
  }
  openKickModal(member: GroupMember): void { 
    this.selectedMember = member;
    this.isMemberActionsModalVisible = false; // FIX: Close the actions modal first
    this.isKickModalVisible = true;
  }

  // FIX: Add trackBy function to optimize ngFor rendering
  trackByMemberId(index: number, member: GroupMember): string {
    return member.id;
  }
}