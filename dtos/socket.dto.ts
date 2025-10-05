export interface SocketConversationData {
  conversationId: string;
  userId: string;
  participants?: string[];
}

export interface SocketMessageData {
  messageId?: string;
  conversationId: string;
  senderId: string;
  content?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice_note' | 'location';
  attachments?: string[];
  replyTo?: string;
}

export interface SocketReactionData {
  messageId: string;
  userId: string;
  reaction: string;
  conversationId: string;
}