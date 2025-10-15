export interface Conversation {
    id: string;
    name: string;
    avatar?: string;
    isGroup: boolean;
    ownerId?: string;
    unreadCount: number;
    participants: Participant[];
}

export interface Participant {
    userId: string;
    username: string;
    nickname?: string;
    role: number; // Corresponds to ChatRole enum in backend
}

export enum ChatRole {
    Member = 0,
    Admin = 1,
    Owner = 2
}