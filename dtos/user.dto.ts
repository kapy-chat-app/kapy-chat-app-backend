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
