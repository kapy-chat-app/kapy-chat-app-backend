/* eslint-disable @typescript-eslint/no-explicit-any */
export interface UserRes {
  id: string;
  clerkId: string;
  email: string;
  full_name: string;
  username: string;
  bio?: string;
  avatar?: {
    id: string;
    url: string;
    file_name: string;
  };
  cover_photo?: {
    id: string;
    url: string;
    file_name: string;
  };
  phone?: string;
  date_of_birth?: Date;
  gender?: string;
  location?: string;
  website?: string;
  is_online: boolean;
  last_seen?: Date;
  status?: string;
  created_at: Date;
}

export interface UserCreateReq {
  clerkId: string;
  email: string;
  full_name: string;
  username: string;
  bio?: string;
  phone?: string;
  date_of_birth?: Date;
  gender?: string;
  location?: string;
  website?: string;
}

export interface UserUpdateReq {
  full_name?: string;
  username?: string;
  bio?: string;
  phone?: string;
  date_of_birth?: Date;
  gender?: string;
  location?: string;
  website?: string;
  status?: string;
  privacy_settings?: any;
  notification_settings?: any;
  ai_preferences?: any;
}
export interface ProfileUpdateDTO {
  full_name?: string;
  username?: string;
  bio?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other' | 'private';
  location?: string;
  website?: string;
  status?: string;
}

export interface ProfileResponse {
  id: string;
  clerkId: string;
  email: string;
  full_name: string;
  username: string;
  bio?: string;
  phone?: string;
  date_of_birth?: Date;
  gender?: string;
  location?: string;
  website?: string;
  status?: string;
  avatar?: {
    id: string;
    url: string;
    file_name: string;
  };
  created_at: Date;
  updated_at: Date;
  clerk_data?: {
    first_name?: string;
    last_name?: string;
    profile_image_url?: string;
    email_verified?: boolean;
    phone_verified?: boolean;
    last_sign_in?: Date;
    created_at_clerk?: Date;
  };
}

export interface ProfileActionResult {
  success: boolean;
  data?: ProfileResponse;
  message?: string;
  error?: string;
  profileComplete?: boolean;
}