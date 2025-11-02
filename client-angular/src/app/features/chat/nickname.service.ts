import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const NICKNAME_STORAGE_KEY = 'group-nicknames';

export interface NicknameUpdate {
  groupId: string;
  userId: string;
  nickname: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class NicknameService {
  private nicknames: { [groupId: string]: { [userId: string]: string } } = {};
  private nicknameUpdateSubject = new BehaviorSubject<NicknameUpdate | null>(null);

  constructor() {
    this.loadNicknames();
  }

  private loadNicknames(): void {
    const storedNicknames = localStorage.getItem(NICKNAME_STORAGE_KEY);
    if (storedNicknames) {
      try {
        this.nicknames = JSON.parse(storedNicknames);
      } catch (e) {
        console.error("Failed to parse nicknames from localStorage", e);
        this.nicknames = {};
      }
    }
  }

  private saveNicknames(): void {
    localStorage.setItem(NICKNAME_STORAGE_KEY, JSON.stringify(this.nicknames));
  }

  getNicknameUpdates() {
    return this.nicknameUpdateSubject.asObservable();
  }

  getNickname(groupId: string, userId: string): string | null {
    return this.nicknames[groupId]?.[userId] || null;
  }

  /**
   * Gets a copy of all nicknames for a specific group.
   * @param groupId The ID of the group.
   * @returns An object mapping user IDs to their nicknames for that group.
   */
  getNicknamesForGroup(groupId: string): { [userId: string]: string } {
    return { ...(this.nicknames[groupId] || {}) };
  }

  setNickname(groupId: string, userId: string, nickname: string): void {
    this.nicknames[groupId] = this.nicknames[groupId] || {};
    const trimmedNickname = nickname.trim();

    trimmedNickname ? (this.nicknames[groupId][userId] = trimmedNickname) : delete this.nicknames[groupId][userId];
    this.saveNicknames();
    this.nicknameUpdateSubject.next({ groupId, userId, nickname: trimmedNickname || null });
  }
}