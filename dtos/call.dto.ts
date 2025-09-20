export interface CallRes {
  id: string;
  conversation: string;
  caller: {
    id: string;
    username: string;
    full_name: string;
    avatar?: {
      id: string;
      url: string;
    };
  };
  participants: {
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
    status: string;
  }[];
  type: 'audio' | 'video';
  status: string;
  started_at: Date;
  ended_at?: Date;
  duration?: number;
  recording?: {
    id: string;
    url: string;
    file_name: string;
  };
  quality_rating?: number;
  created_at: Date;
}