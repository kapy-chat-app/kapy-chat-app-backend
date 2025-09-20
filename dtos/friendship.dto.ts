export interface FriendshipRes {
  id: string;
  requester: {
    id: string;
    username: string;
    full_name: string;
    avatar?: {
      id: string;
      url: string;
    };
  };
  recipient: {
    id: string;
    username: string;
    full_name: string;
    avatar?: {
      id: string;
      url: string;
    };
  };
  status: string;
  created_at: Date;
  accepted_at?: Date;
}