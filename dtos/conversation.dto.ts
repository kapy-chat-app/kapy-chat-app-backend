import { FileRes } from "./file.dto";
import { MessageResponseDTO } from "./message.dto";
import { UserRes } from "./user.dto";

export interface CreateConversationDTO {
  type: "private" | "group";
  participantIds: string[];
  name?: string;
  description?: string;
}

export interface UpdateConversationDTO {
  name?: string;
  description?: string;
  avatar?: string;
}

export interface ConversationResponseDTO {
  id: string;
  type: "private" | "group";
  participants: UserRes[];
  name?: string;
  description?: string;
  avatar?: FileRes;
  lastMessage?: MessageResponseDTO;
  lastActivity: Date;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}
