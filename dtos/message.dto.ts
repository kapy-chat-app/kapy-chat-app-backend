import { FileRes } from "./file.dto";
import { SearchUserResponseDto } from "./friend.dto";

export interface CreateMessageDTO {
  conversationId: string;
  content?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice_note' | 'location';
  attachments?: string[]; // File IDs
  replyTo?: string; // Message ID
}

export interface MessageResponseDTO {
  id: string;
  conversation: string;
  sender: SearchUserResponseDto;
  content?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice_note' | 'location';
  attachments: FileRes[];
  replyTo?: MessageResponseDTO;
  reactions: {
    user: string;
    type: string;
    createdAt: Date;
  }[];
  isEdited: boolean;
  editedAt?: Date;
  readBy: {
    user: string;
    readAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageDTO {
  conversationId: string;
  content?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice_note' | 'location';
  attachments?: string[];
  replyTo?: string;
}