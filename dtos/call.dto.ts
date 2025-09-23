// DTOs cho Call Model - Đơn giản như Zalo/Messenger

export interface CallParticipantDto {
  user: {
    id: string;
    username: string;
    full_name: string;
    avatar?: {
      id: string;
      url: string;
    };
  };
  joined_at?: Date;
  left_at?: Date;
  status: "ringing" | "joined" | "declined" | "missed" | "left";
  is_muted: boolean;
  is_video_enabled: boolean;
}

export interface CallRes {
  id: string;
  conversation: {
    id: string;
    name?: string;
    type: "private" | "group";
    participants: string[];
  };
  caller: {
    id: string;
    username: string;
    full_name: string;
    avatar?: {
      id: string;
      url: string;
    };
  };
  participants: CallParticipantDto[];
  type: "audio" | "video";
  is_group_call: boolean;
  status: "ringing" | "ongoing" | "ended" | "declined" | "missed" | "cancelled";
  started_at: Date;
  ended_at?: Date;
  duration?: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePersonalCallDto {
  recipient_id: string;
  type: "audio" | "video";
  conversation_id: string;
}

export interface CreateGroupCallDto {
  participant_ids: string[];
  type: "audio" | "video";
  conversation_id: string;
}

export interface UpdateParticipantStatusDto {
  user_id: string;
  status: "ringing" | "joined" | "declined" | "missed" | "left";
  options?: {
    is_muted?: boolean;
    is_video_enabled?: boolean;
  };
}

export interface CallHistoryQueryDto {
  page?: number;
  limit?: number;
  is_group_call?: boolean;
  type?: "audio" | "video";
  status?:
    | "ringing"
    | "ongoing"
    | "ended"
    | "declined"
    | "missed"
    | "cancelled";
  date_from?: string;
  date_to?: string;
}

export interface CallStatisticsDto {
  total_calls: number;
  total_duration: number;
  personal_calls: number;
  group_calls: number;
  audio_calls: number;
  video_calls: number;
}
