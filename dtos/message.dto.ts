import { FileRes } from "./file.dto";
import { SearchUserResponseDto } from "./friend.dto";

export interface CreateMessageDTO {
  conversationId: string;
  content?: string;
  encryptedContent?: string;
  encryptionMetadata?: {
    type: "PreKeyWhisperMessage" | "WhisperMessage";
    registration_id?: number;
    pre_key_id?: number;
    signed_pre_key_id?: number;
  };
  type?: "text" | "image" | "video" | "audio" | "file" | "voice_note" | "location";
  attachments?: string[];
  encryptedFiles?: Array<{ // ✅ NEW
    encryptedBase64: string;
    originalFileName: string;
    originalFileType: string;
    encryptionMetadata: {
      iv: string;
      auth_tag: string;
      original_size: number;
      encrypted_size: number;
    };
  }>;
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
