/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/dto/user-management.dto.ts

/**
 * Combined User Data (MongoDB + Clerk)
 */
export interface CombinedUserData {
  // MongoDB data
  _id: string;
  clerkId: string;
  email: string;
  full_name: string;
  username: string;
  bio?: string;
  avatar?: string;
  cover_photo?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other' | 'private';
  location?: string;
  website?: string;
  is_online: boolean;
  last_seen?: string;
  status?: string;
  created_at: string;
  updated_at: string;
  
  // Privacy settings
  privacy_settings: {
    profile_visibility: 'public' | 'friends' | 'private';
    phone_visibility: 'public' | 'friends' | 'private';
    email_visibility: 'public' | 'friends' | 'private';
    last_seen_visibility: 'everyone' | 'friends' | 'nobody';
  };
  
  // Notification settings
  notification_settings: {
    message_notifications: boolean;
    call_notifications: boolean;
    friend_request_notifications: boolean;
    ai_suggestions_notifications: boolean;
  };
  
  // AI preferences
  ai_preferences: {
    enable_behavior_analysis: boolean;
    enable_emotion_suggestions: boolean;
    preferred_suggestion_frequency: 'high' | 'medium' | 'low';
  };
  
  // Clerk data
  clerkData: {
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    emailAddresses: Array<{
      emailAddress: string;
      verification: {
        status: string;
      };
    }>;
    phoneNumbers: Array<{
      phoneNumber: string;
    }>;
    banned: boolean;
    locked: boolean;
    createdAt: number;
    updatedAt: number;
    lastSignInAt?: number;
    publicMetadata?: {
      role?: string;
      [key: string]: any;
    };
  };
  
  // Combined computed fields
  displayName: string;
  displayAvatar: string;
  accountStatus: 'active' | 'banned' | 'locked';
  emailVerified: boolean;
  role: string;
}

/**
 * User List Query Params
 */
export interface UserListQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'active' | 'banned' | 'locked' | 'online' | 'offline';
  role?: 'all' | 'user' | 'admin' | 'moderator';
  sortBy?: 'created_at' | 'last_seen' | 'full_name' | 'email';
  sortOrder?: 'asc' | 'desc';
  gender?: 'all' | 'male' | 'female' | 'other' | 'private';
  emailVerified?: 'all' | 'verified' | 'unverified';
}

/**
 * User List Response
 */
export interface UserListResponse {
  success: boolean;
  data: CombinedUserData[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalUsers: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: {
    applied: UserListQueryParams;
    available: {
      statuses: string[];
      roles: string[];
      genders: string[];
    };
  };
}

/**
 * User Detail Response
 */
export interface UserDetailResponse {
  success: boolean;
  data: CombinedUserData;
  statistics: {
    totalConversations: number;
    totalMessages: number;
    totalCalls: number;
    totalFriends: number;
    accountAge: string;
    lastActivity: string;
  };
}

/**
 * User Status Update Request
 */
export interface UserStatusUpdateRequest {
  userId: string;
  action: 'ban' | 'unban' | 'lock' | 'unlock';
  reason?: string;
}

/**
 * User Status Update Response
 */
export interface UserStatusUpdateResponse {
  success: boolean;
  message: string;
  data: {
    userId: string;
    clerkId: string;
    previousStatus: string;
    newStatus: string;
    updatedAt: string;
  };
}

/**
 * Search Suggestion
 */
export interface SearchSuggestion {
  type: 'user' | 'email' | 'username';
  value: string;
  label: string;
  avatar?: string;
}