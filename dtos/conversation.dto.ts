import { MessageRes } from "./message.dto";

export interface ConversationRes {
  id: string;
  type: "private" | "group";
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
    full_name: string;
  };
  last_message?: MessageRes;
  last_activity: Date;
  is_archived: boolean;
  is_pinned: boolean;
  is_muted: boolean;
  is_blocked: boolean;
  settings: {
    allow_member_invite: boolean;
    allow_member_edit_info: boolean;
    allow_member_send_message: boolean;
    allow_member_see_members: boolean;
  };
  unread_count?: number;
  created_by: {
    id: string;
    username: string;
    full_name: string;
  };
  created_at: Date;
  updated_at: Date;
}

export interface ConversationCreateReq {
  type: "private" | "group";
  participants: string[];
  name?: string;
  description?: string;
}

export interface ConversationUpdateReq {
  name?: string;
  description?: string;
  avatar?: string;
  settings?: {
    allow_member_invite?: boolean;
    allow_member_edit_info?: boolean;
    allow_member_send_message?: boolean;
    allow_member_see_members?: boolean;
  };
}

export interface ConversationActionReq {
  action:
    | "pin"
    | "unpin"
    | "mute"
    | "unmute"
    | "archive"
    | "unarchive"
    | "block"
    | "unblock";
}

export interface ConversationParticipantReq {
  user_id: string;
  action: "add" | "remove" | "make_admin" | "remove_admin";
}
