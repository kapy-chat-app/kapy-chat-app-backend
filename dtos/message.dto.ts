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
  type: string;
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
    };
    emoji: string;
    created_at: Date;
  }[];
  is_edited: boolean;
  edited_at?: Date;
  read_by: {
    user: {
      id: string;
      username: string;
    };
    read_at: Date;
  }[];
  created_at: Date;
}

export interface MessageCreateReq {
  conversation: string;
  content?: string;
  type?: string;
  attachments?: string[];
  reply_to?: string;
  metadata?: any;
}