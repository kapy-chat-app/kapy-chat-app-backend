export interface SearchUserDto {
  query: string;
  limit?: number;
  excludeCurrentUser?: boolean;
}

export interface SearchUserResponseDto {
  id: string;
  username: string;
  full_name: string;
  avatar?: string;
  bio?: string;
  is_online: boolean;
  mutualFriendsCount: number;
  friendshipStatus: 'none' | 'pending' | 'accepted' | 'sent' | 'blocked';
}

export interface SendFriendRequestDto {
  recipientId: string;
}

export interface RespondFriendRequestDto {
  requestId: string;
  action: 'accept' | 'decline' | 'block';
}

export interface GetFriendsDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'online' | 'all';
}

export interface FriendDto {
  id: string;
  clerkId:string;
  username: string;
  full_name: string;
  avatar?: string;
  is_online: boolean;
  last_seen?: Date;
  mutualFriendsCount: number;
  friendshipDate: Date;
}

export interface UserProfileDto {
  id: string;
  username: string;
  full_name: string;
  bio?: string;
  avatar?: string;
  cover_photo?: string;
  location?: string;
  website?: string;
  is_online: boolean;
  last_seen?: Date;
  status?: string;
  friendsCount: number;
  mutualFriendsCount: number;
  friendshipStatus: 'none' | 'pending' | 'accepted' | 'sent' | 'blocked';
  canViewProfile: boolean;
}

export interface FriendSuggestionDto {
  id: string;
  username: string;
  full_name: string;
  avatar?: string;
  bio?: string;
  mutualFriendsCount: number;
  mutualFriends: Array<{
    id: string;
    username: string;
    full_name: string;
  }>;
  suggestionReason: 'mutual_friends' | 'location' | 'common_interests';
}

export interface BlockUserDto {
  userId: string;
  reason?: string;
}

export interface UnblockUserDto {
  userId: string;
}

export interface GetBlockedUsersDto {
  page?: number;
  limit?: number;
  search?: string;
}

export interface BlockedUserDto {
  id: string;
  username: string;
  full_name: string;
  avatar?: string;
  blockedAt: Date;
  reason?: string;
}

export interface GetFriendRequestsDto {
  page?: number;
  limit?: number;
  type?: 'received' | 'sent' | 'all'; // Loại requests cần lấy
}

export interface FriendRequestDto {
  id: string;
  requester: {
    id: string;
    username: string;
    full_name: string;
    avatar?: string;
  };
  recipient: {
    id: string;
    username: string;
    full_name: string;
    avatar?: string;
  };
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: Date;
  updated_at: Date;
}