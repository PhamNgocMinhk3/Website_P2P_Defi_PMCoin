import { User } from '../services/auth.service';

export interface ChatUser {
  id: string;
  name: string;
  avatar: string | null;
  active: boolean;
  isGroup?: boolean;
  isOnline?: boolean;
  lastSeen?: Date;
  showOnlineStatus?: boolean;
  otherUserId?: string;
  isBlockedByYou?: boolean;
  isBlockedByOther?: boolean;
  lastMessage?: string;
  time?: string;
  unreadCount?: number;
  hasUnreadMessages?: boolean;
  lastMessageTimestamp?: Date;
  settings?: GroupSettings;
  memberCount?: number;
  createdAt?: Date; // <-- FIX: Add missing property
  firstName?: string;
  lastName?: string;
  isSearchResult?: boolean; // FIX: Add property to distinguish search results
  description?: string; // FIX: Add property for group description
}

export interface GroupSettings {
  requireApproval: boolean;
  onlyAdminsCanSend: boolean;
  allowMemberInvite: boolean;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar: string | null;
  content: string;
  timestamp: Date;
  isOutgoing: boolean;
  isRead?: boolean;
  isPinned?: boolean;
  type: 'text' | 'image' | 'file' | 'audio' | 'poll' | 'gif' | 'appointment';
  attachments?: any;
  reactions?: { [key: string]: string[] };
  createdAt: Date;

  // Type-specific properties
  imageUrls?: string[];
  fileInfo?: FileMessage;
  audioUrl?: string;
  pollData?: PollMessage;
  gifUrl?: string;
  appointmentData?: AppointmentMessage;
  text?: string;
}

export interface ImageMessage {
  urls: string[];
  caption?: string;
}

export interface FileMessage {
  name: string;
  size: string;
  type?: string;
  url?: string;
}

export interface PollMessage {
  question: string;
  options: {
    text: string;
    votes: number;
    voters: string[];
  }[];
}

export interface AppointmentMessage extends Appointment {
  declinedBy?: string[]; // FIX: Add property for users who declined
  // Inherits all properties from Appointment
}

export interface Appointment {
  id: number;
  title: string;
  description?: string;
  dateTime: Date;
  createdBy: User;
  participants: User[];
}

export interface GroupMember {
  id: string;
  name: string;
  avatar: string | null;
  role: 'owner' | 'admin' | 'member';
  isOnline?: boolean;
  lastSeen?: Date;
  nickname?: string;
  showOnlineStatus?: boolean; // FIX: Add property to check online status privacy
  firstName?: string; // FIX: Add property for full name display
  lastName?: string; // FIX: Add property for full name display
}

export interface UserSearchResult {
  id: string;
  username: string;
  fullName: string;
  firstName: string; // FIX: Add property from API response
  lastName: string; // FIX: Add property from API response
  avatar: string | null;
  isOnline?: boolean; // FIX: Add property from API response
}

export interface PinnedMessage {
  message: ChatMessage;
  pinnedBy: User;
  pinnedAt: Date;
  userId: string;
  conversationId: string;
}

export interface SharedLink {
  id: number;
  url: string;
  title: string;
  timestamp: Date;
  conversationId?: string;
  isUnsafe: boolean;
}

export interface SharedImage {
  url: string; name: string; messageId: string; sender: string; date: Date; type: 'image';
}

export interface SharedFile {
  name: string; size: string; type: string; url: string; messageId: string; date: Date; sender: string;
}