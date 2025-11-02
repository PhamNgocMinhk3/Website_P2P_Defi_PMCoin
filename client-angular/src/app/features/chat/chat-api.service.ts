import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../../core/models/api-response.model';
import { ChatMessage, GroupMember, UserSearchResult } from '../../core/models/chat.models';
import { ChatUser } from './chat.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ChatApiService {
  private readonly apiUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) {}

  /**
   * Tìm kiếm người dùng theo từ khóa (username, email, tên, walletCode).
   * @param term Từ khóa tìm kiếm.
   * @returns Danh sách người dùng phù hợp.
   */
  searchUsers(term: string): Observable<ApiResponse<UserSearchResult[]>> {
    if (!term.trim()) {
      // Trả về một Observable rỗng nếu không có từ khóa
      return new Observable(observer => {
        observer.next({ success: true, data: [], message: 'Empty search term' });
        observer.complete();
      });
    }
    const params = new HttpParams().set('term', term);
    return this.http.get<ApiResponse<UserSearchResult[]>>(`${this.apiUrl}/users/search`, { params });
  }

  /**
   * Creates a new 1-on-1 conversation with a target user, or retrieves it if it already exists.
   * @param targetUserId The ID of the user to start a conversation with.
   * @returns The conversation object.
   */
  createOrGetOneOnOneConversation(targetUserId: string): Observable<ChatUser> {
    return this.http.post<ChatUser>(`${this.apiUrl}/chat/one-on-one`, { targetUserId });
  }

  /**
   * Gets the list of conversations for the current user.
   */
  getConversations(): Observable<ChatUser[]> {
    return this.http.get<ChatUser[]>(`${this.apiUrl}/chat/conversations`);
  }

  /**
   * Creates a new group chat.
   * @param name The name of the group.
   * @param memberIds The list of user IDs to add to the group.
   */
  createGroup(name: string, memberIds: string[]): Observable<ChatUser> {
    return this.http.post<ChatUser>(`${this.apiUrl}/chat/groups`, { name, memberIds });
  }

  /**
   * Gets the members of a group conversation.
   * @param conversationId The ID of the group conversation.
   */
  getGroupMembers(conversationId: string): Observable<GroupMember[]> {
    return this.http.get<GroupMember[]>(`${this.apiUrl}/chat/${conversationId}/members`);
  }
  /**
   * Gets the message history for a specific conversation.
   */
  getMessages(conversationId: string): Observable<ChatMessage[]> {
    // TODO: Add pagination params
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/chat/${conversationId}/messages`);
  }

  sendMessage(chatId: string, originalPayload: any): Observable<ChatMessage> {
    const finalPayload: { chatId: string; type: string; content: any } = {
      chatId,
      type: originalPayload.type,
      content: '',
    };

    // The 'content' field should contain the JSON string of the data part only.
    switch (finalPayload.type) {
      case 'text':
        finalPayload.content = originalPayload.text;
        break;
      case 'gif':
        finalPayload.content = JSON.stringify({ gifUrl: originalPayload.gifUrl });
        break;
      case 'image':
        finalPayload.content = JSON.stringify({ imageUrls: originalPayload.imageUrls });
        break;
      case 'file':
        finalPayload.content = JSON.stringify({ fileInfo: originalPayload.fileInfo });
        break;
      case 'audio':
        finalPayload.content = JSON.stringify({ audioUrl: originalPayload.audioUrl });
        break;
      case 'poll':
        finalPayload.content = JSON.stringify(originalPayload.pollData);
        break;
      case 'appointment':
        finalPayload.content = JSON.stringify(originalPayload.appointmentData);
        break;
      default:
        // Fallback for any other types, though ideally all should be handled above.
        finalPayload.content = JSON.stringify(originalPayload);
    }
    return this.http.post<ChatMessage>(`${this.apiUrl}/chat/messages`, finalPayload);
  }

  /**
   * Deletes a message from the server.
   * @param messageId The ID of the message to delete.
   */
  deleteMessage(messageId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/chat/messages/${messageId}`);
  }

  /**
   * Deletes a conversation from the server.
   * @param conversationId The ID of the conversation to delete.
   */
  deleteConversation(conversationId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/chat/conversations/${conversationId}`);
  }

  /**
   * Blocks a user.
   * @param userId The ID of the user to block.
   */
  blockUser(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/users/${userId}/block`, {});
  }

  /**
   * Unblocks a user.
   * @param userId The ID of the user to unblock.
   */
  unblockUser(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${userId}/unblock`);
  }

  /**
   * Reports a user.
   * @param payload The report details.
   */
  reportUser(payload: { userId: string; reason: string; customReason?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/users/report`, payload);
  }

  /**
   * Adds or removes a reaction from a message.
   * @param messageId The ID of the message to react to.
   * @param reaction The emoji reaction string.
   */
  toggleReaction(messageId: string, reaction: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/chat/messages/${messageId}/reactions`, { reaction });
  }

  /**
   * Marks all messages in a conversation as read for the current user.
   */
  markAsRead(conversationId: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/chat/conversations/${conversationId}/read`, {});
  }

  /**
   * Cast a vote on a poll option.
   * @param messageId The ID of the poll message.
   * @param optionIndex The index of the option to vote for.
   */
  voteOnPoll(messageId: string, optionIndex: number, pollData: any): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/chat/messages/${messageId}/vote`, { optionIndex, pollData });
  }

  /**
   * Accepts an appointment invitation.
   */
  acceptAppointment(messageId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/chat/messages/${messageId}/appointments/accept`, {});
  }

  /**
   * Declines or leaves an appointment.
   */
  declineAppointment(messageId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/chat/messages/${messageId}/appointments/decline`, {});
  }

  /**
   * Adds a new option to an existing poll.
   */
  addPollOption(messageId: string, optionText: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/chat/messages/${messageId}/poll/options`, { optionText });
  }

  updateMemberRole(conversationId: string, memberId: string, role: 'admin' | 'member'): Observable<any> {
    return this.http.put(`${this.apiUrl}/chat/groups/${conversationId}/members/${memberId}/role`, { role });
  }

  kickMember(conversationId: string, memberId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/chat/groups/${conversationId}/members/${memberId}`);
  }

  transferOwnership(conversationId: string, newOwnerId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/chat/groups/${conversationId}/transfer-ownership`, { newOwnerId });
  }

  setMemberNickname(conversationId: string, memberId: string, nickname: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/chat/groups/${conversationId}/members/${memberId}/nickname`, { nickname });
  }

  /**
   * Adds members to an existing group chat.
   * @param conversationId The ID of the group.
   * @param memberIds The list of user IDs to add.
   */
  addMembersToGroup(conversationId: string, memberIds: string[]): Observable<{ message: string, wasAddedToPending: boolean }> {
    return this.http.post<{ message: string, wasAddedToPending: boolean }>(`${this.apiUrl}/chat/groups/${conversationId}/members`, { memberIds });
  }

  leaveGroup(conversationId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/chat/groups/${conversationId}/leave`, {});
  }

  getPendingMembers(conversationId: string): Observable<GroupMember[]> {
    return this.http.get<GroupMember[]>(`${this.apiUrl}/chat/groups/${conversationId}/pending-members`);
  }

  approvePendingMember(conversationId: string, memberId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/chat/groups/${conversationId}/members/${memberId}/approve`, {});
  }

  rejectPendingMember(conversationId: string, memberId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/chat/groups/${conversationId}/members/${memberId}/reject`);
  }

  updateGroupSettings(groupId: string, settings: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/chat/groups/${groupId}/settings`, settings);
  }

  disbandGroup(groupId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/chat/groups/${groupId}`);
  }

}