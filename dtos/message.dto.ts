import { FileRes } from "./file.dto";
import { SearchUserResponseDto } from "./friend.dto";

export interface CreateMessageDTO {
  conversationId: string;
  content?: string; // Optional plaintext (chỉ cho AI emotion analysis)
  encryptedContent?: string; // ✨ Required for text messages
  encryptionMetadata?: {
    type: 'prekey' | 'whisper';
    preKeyId?: number;
    registrationId?: number;
    baseKey?: string;
    identityKey?: string;
    signedPreKeyId?: number;
  };
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  attachments?: string[];
  replyTo?: string;
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
