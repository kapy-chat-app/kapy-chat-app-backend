/* eslint-disable @typescript-eslint/no-explicit-any */
// src/types/message.dto.ts (UPDATE)
import { FileRes } from "./file.dto";
import { SearchUserResponseDto } from "./friend.dto";

// ✨ NEW: Rich Media DTO
export interface RichMediaDTO {
  provider: "giphy" | "tenor" | "custom" | string;
  provider_id: string;
  url: string;
  media_url: string;
  preview_url?: string;
  width: number;
  height: number;
  size?: number;
  title?: string;
  rating?: string;
  tags?: string[];
  source_url?: string;
  extra_data?: Record<string, any>;
}

// ✨ UPDATE: CreateMessageDTO - Thêm rich_media
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
  type?: "text" | "image" | "video" | "audio" | "file" | "voice_note" | "location" | "gif" | "sticker";
  attachments?: string[];
  encryptedFiles?: Array<{
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
  richMedia?: RichMediaDTO; // ✨ NEW
}

// ✨ UPDATE: MessageResponseDTO - Thêm rich_media
export interface MessageResponseDTO {
  id: string;
  conversation: string;
  sender: SearchUserResponseDto;
  content?: string;
  encryptedContent?: string;
  encryptionMetadata?: {
    type: "PreKeyWhisperMessage" | "WhisperMessage";
    registration_id?: number;
    pre_key_id?: number;
    signed_pre_key_id?: number;
  };
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice_note' | 'location' | 'gif' | 'sticker';
  attachments: FileRes[];
  replyTo?: MessageResponseDTO;
  reactions: {
    user: SearchUserResponseDto;
    type: "heart" | "like" | "sad" | "angry" | "laugh" | "wow" | "dislike";
    createdAt: Date;
  }[];
  isEdited: boolean;
  editedAt?: Date;
  readBy: {
    user: SearchUserResponseDto;
    readAt: Date;
  }[];
  richMedia?: RichMediaDTO; // ✨ NEW
  createdAt: Date;
  updatedAt: Date;
}

// ✨ NEW: Reaction DTOs
export type ReactionType = "heart" | "like" | "sad" | "angry" | "laugh" | "wow" | "dislike";

export interface AddReactionDTO {
  messageId: string;
  reactionType: ReactionType;
}

export interface RemoveReactionDTO {
  messageId: string;
}

export interface ReactionResponseDTO {
  user: SearchUserResponseDto;
  type: ReactionType;
  createdAt: Date;
}

// ✨ NEW: Giphy Search DTOs
export interface SearchGiphyDTO {
  query: string;
  limit?: number;
  offset?: number;
  rating?: "g" | "pg" | "pg-13" | "r";
  type?: "gif" | "sticker";
}

export interface GiphyItemDTO {
  id: string;
  url: string;
  title: string;
  rating: string;
  images: {
    original: {
      url: string;
      width: number;
      height: number;
      size: number;
    };
    preview_gif?: {
      url: string;
      width: number;
      height: number;
    };
    fixed_width?: {
      url: string;
      width: number;
      height: number;
    };
  };
  tags?: string[];
}

export interface SearchGiphyResponseDTO {
  data: GiphyItemDTO[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

// ✨ NEW: Popular Rich Media DTO
export interface PopularRichMediaDTO {
  provider: string;
  providerId: string;
  richMedia: RichMediaDTO;
  count: number;
  lastUsed: Date;
}

