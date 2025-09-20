import { MessageRes } from "./message.dto";

export interface ConversationRes {
  id: string;
  type: 'private' | 'group';
  participants: {
    id: string;
    username: string;
    full_name: string;
    avatar?: {
      id: string;
      url: string;
    };
    is_online: boolean;
    last_seen?: Date;
  }[];
  name?: string;
  avatar?: {
    id: string;
    url: string;
  };
  description?: string;
  admin?: {
    id: string;
    username: string;
  };
  last_message?: MessageRes;
  last_activity: Date;
  unread_count?: number;
  created_at: Date;
}

export interface ConversationCreateReq {
  type: 'private' | 'group';
  participants: string[];
  name?: string;
  description?: string;
}