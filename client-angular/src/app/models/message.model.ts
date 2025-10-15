
export interface Message {
    id: string;
    chatId: string;
    senderId: string;
    senderName: string;
    type: string;
    content?: string;
    attachments?: string; // JSON string
    createdAt: Date;
    parentMessageId?: string;
    reactions?: MessageReaction[];
}

export interface MessageReaction {
    id: string;
    messageId: string;
    userId: string;
    reaction: string;
}
