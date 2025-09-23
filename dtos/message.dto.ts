/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MessageRes {
  id: string;
  conversation: string;
  sender: {
    id: string;
    username: string;
    full_name: string;
    avatar?: {
      id: string;
      url: string;
    };
  };
  content?: string;
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "voice_note"
    | "location"
    | "call_log";
  attachments: {
    id: string;
    file_name: string;
    url: string;
    file_type: string;
    file_size: number;
  }[];
  reply_to?: MessageRes;
  reactions: {
    user: {
      id: string;
      username: string;
      full_name: string;
    };
    type: "heart" | "like" | "sad" | "angry" | "laugh" | "wow" | "dislike";
    created_at: Date;
  }[];
  is_edited: boolean;
  edited_at?: Date;
  deleted_by: {
    user: {
      id: string;
      username: string;
      full_name: string;
    };
    deleted_at: Date;
    delete_type: "both" | "only_me";
  }[];
  read_by: {
    user: {
      id: string;
      username: string;
      full_name: string;
    };
    read_at: Date;
  }[];
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export interface MessageCreateReq {
  conversation: string;
  content?: string;
  type?:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "voice_note"
    | "location"
    | "call_log";
  attachments?: string[];
  reply_to?: string;
  metadata?: any;
}

export interface MessageUpdateReq {
  content?: string;
  metadata?: any;
}

export interface MessageReactionReq {
  type: "heart" | "like" | "sad" | "angry" | "laugh" | "wow" | "dislike";
}

export interface MessageDeleteReq {
  delete_type: "both" | "only_me";
}

export interface MessageQueryReq {
  page?: number;
  limit?: number;
  type?:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "voice_note"
    | "location"
    | "call_log";
  date_from?: string;
  date_to?: string;
}
