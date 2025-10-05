/* eslint-disable @typescript-eslint/no-explicit-any */
// dtos/message-info.dto.ts

export interface MediaResponseDTO {
  messages: MessageWithMedia[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface MessageWithMedia {
  _id: string;
  sender: {
    _id: string;
    clerkId: string;
    full_name: string;
    username: string;
    avatar?: string;
  };
  attachments: {
    _id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    url: string;
  }[];
  type: 'image' | 'video' | 'file' | 'audio';
  created_at: string;
}

export interface SearchMessagesResponseDTO {
  messages: SearchMessageResult[];
  searchQuery: string;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface SearchMessageResult {
  _id: string;
  sender: {
    _id: string;
    clerkId: string;
    full_name: string;
    username: string;
    avatar?: string;
  };
  content: string;
  attachments?: {
    _id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    url: string;
  }[];
  created_at: string;
}

export interface ConversationActionResponseDTO {
  success: boolean;
  message: string;
  data?: any;
}

// types/navigation.ts - Navigation params
export type RootStackParamList = {
  '(tabs)/conversation': undefined;
  '(tabs)/conversations/[id]': {
    id: string;
    scrollToMessageId?: string;
  };
  '(tabs)/conversations/[id]/info': {
    id: string;
    type: 'private' | 'group';
    name: string;
    avatar?: string;
    participantCount: number;
  };
  '(tabs)/conversations/[id]/media-viewer': {
    messageId: string;
    url: string;
    type: 'image' | 'video';
    index: string;
  };
};