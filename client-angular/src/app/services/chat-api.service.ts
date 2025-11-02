import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { Conversation } from '../models/conversation.model';
import { Message } from '../models/message.model';

@Injectable({
  providedIn: 'root'
})
export class ChatApiService {

  private apiUrl = 'http://localhost:5000/api/chat';

  constructor(private http: HttpClient) { }

  getConversations(): Observable<ApiResponse<Conversation[]>> {
    return this.http.get<ApiResponse<Conversation[]>>(`${this.apiUrl}/conversations`);
  }

  getMessages(conversationId: string, page: number, pageSize: number): Observable<ApiResponse<Message[]>> {
    return this.http.get<ApiResponse<Message[]>>(`${this.apiUrl}/${conversationId}/messages?page=${page}&pageSize=${pageSize}`);
  }

  createOrGetOneOnOneChat(recipientId: string): Observable<ApiResponse<Conversation>> {
    return this.http.post<ApiResponse<Conversation>>(`${this.apiUrl}/one-on-one`, { recipientId });
  }

  markAsRead(conversationId: string): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${this.apiUrl}/conversations/${conversationId}/read`, {});
  }

  createGroup(name: string, userIds: string[]): Observable<ApiResponse<Conversation>> {
    return this.http.post<ApiResponse<Conversation>>(`${this.apiUrl}/groups`, { name, userIds });
  }
}