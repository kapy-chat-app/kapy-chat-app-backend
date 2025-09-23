/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import {
  ProfileResponse,
  ProfileUpdateDTO,
  UserCreateReq,
} from "@/dtos/user.dto";
import { connectToDatabase } from "../mongoose";
import User from "@/database/user.model";
import { uploadFileToCloudinary } from "./file.action";
import { clerkClient } from "@clerk/nextjs/server";

export async function createUser(userData: UserCreateReq) {
  try {
    await connectToDatabase();

    // Check if user already exists
    const existingUser = await User.findOne({ clerkId: userData.clerkId });
    if (existingUser) {
      return {
        success: false,
        error: "User already exists",
        data: null,
      };
    }

    // Check if username is already taken
    const existingUsername = await User.findOne({
      username: userData.username,
    });
    if (existingUsername) {
      return {
        success: false,
        error: "Username is already taken",
        data: null,
      };
    }

    // Create new user with default settings
    const newUser = await User.create({
      clerkId: userData.clerkId,
      email: userData.email,
      full_name: userData.full_name,
      username: userData.username,
      bio: userData.bio || "",
      phone: userData.phone || "",
      date_of_birth: userData.date_of_birth,
      gender: userData.gender || "private",
      location: userData.location || "",
      website: userData.website || "",
      is_online: true,
      last_seen: new Date(),
      privacy_settings: {
        profile_visibility: "friends",
        phone_visibility: "private",
        email_visibility: "private",
        last_seen_visibility: "friends",
      },
      notification_settings: {
        message_notifications: true,
        call_notifications: true,
        friend_request_notifications: true,
        ai_suggestions_notifications: true,
      },
      ai_preferences: {
        enable_behavior_analysis: true,
        enable_emotion_suggestions: true,
        preferred_suggestion_frequency: "medium",
      },
    });

    return {
      success: true,
      error: null,
      data: {
        id: newUser._id.toString(),
        clerkId: newUser.clerkId,
        username: newUser.username,
        email: newUser.email,
        full_name: newUser.full_name,
      },
    };
  } catch (error) {
    console.error("Error creating user:", error);
    return {
      success: false,
      error: "Failed to create user profile",
      data: null,
    };
  }
}

export async function checkUsernameAvailability(username: string) {
  try {
    await connectToDatabase();

    const existingUser = await User.findOne({ username });

    return {
      success: true,
      isAvailable: !existingUser,
      error: null,
    };
  } catch (error) {
    console.error("Error checking username:", error);
    return {
      success: false,
      isAvailable: false,
      error: "Failed to check username availability",
    };
  }
}

export interface ProfileActionResult {
  success: boolean;
  data?: ProfileResponse;
  message?: string;
  error?: string;
  profileComplete?: boolean;
}

export interface AvatarUploadResult {
  success: boolean;
  data?: {
    avatar_url: string;
    profile: ProfileResponse;
  };
  message?: string;
  error?: string;
}

export const getCompleteUserProfile = async (
  clerkId: string
): Promise<ProfileActionResult> => {
  try {
    await connectToDatabase();

    const mongoUser = await User.findOne({ clerkId })
      .populate("avatar", "id file_name url")
      .select({
        clerkId: 1,
        email: 1,
        full_name: 1,
        username: 1,
        bio: 1,
        phone: 1,
        date_of_birth: 1,
        gender: 1,
        location: 1,
        website: 1,
        status: 1,
        avatar: 1,
        created_at: 1,
        updated_at: 1,
      });

    if (!mongoUser) {
      return {
        success: false,
        error: "User not found",
        profileComplete: false,
      };
    }

    let clerkUser;
    try {
      const clerk = await clerkClient();
      clerkUser = await clerk.users.getUser(clerkId);
    } catch (clerkError) {
      console.error("Clerk fetch error:", clerkError);
    }

    let avatar;
    if (mongoUser.avatar) {
      avatar = {
        id: mongoUser.avatar._id.toString(),
        url: mongoUser.avatar.url,
        file_name: mongoUser.avatar.file_name,
      };
    } else if (clerkUser?.imageUrl) {
      avatar = {
        id: "clerk_avatar",
        url: clerkUser.imageUrl,
        file_name: "clerk_profile_image",
      };
    }

    const profileData: ProfileResponse = {
      id: mongoUser._id.toString(),
      clerkId: mongoUser.clerkId,
      email: clerkUser?.emailAddresses?.[0]?.emailAddress || mongoUser.email,
      full_name:
        mongoUser.full_name ||
        (clerkUser
          ? `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim()
          : ""),
      username: mongoUser.username || clerkUser?.username || "",
      bio: mongoUser.bio,
      phone: mongoUser.phone || clerkUser?.phoneNumbers?.[0]?.phoneNumber,
      date_of_birth: mongoUser.date_of_birth,
      gender: mongoUser.gender,
      location: mongoUser.location,
      website: mongoUser.website,
      status: mongoUser.status,
      avatar,
      created_at: mongoUser.created_at,
      updated_at: mongoUser.updated_at,
      clerk_data: {
        profile_image_url: clerkUser?.imageUrl,
        email_verified:
          clerkUser?.emailAddresses?.[0]?.verification?.status === "verified",
        phone_verified:
          clerkUser?.phoneNumbers?.[0]?.verification?.status === "verified",
        last_sign_in: clerkUser?.lastSignInAt
          ? new Date(clerkUser?.lastSignInAt)
          : undefined,
        created_at_clerk: clerkUser?.createdAt
          ? new Date(clerkUser?.createdAt)
          : undefined,
      },
    };

    const profileComplete = !!(
      profileData.full_name &&
      profileData.username &&
      profileData.email
    );

    return {
      success: true,
      data: profileData,
      profileComplete,
    };
  } catch (error: any) {
    console.error("Get profile error:", error);
    return {
      success: false,
      error: "Failed to fetch profile",
      profileComplete: false,
    };
  }
};

export const updateCompleteUserProfile = async (
  clerkId: string,
  updateData: ProfileUpdateDTO
): Promise<ProfileActionResult> => {
  try {
    await connectToDatabase();

    if (updateData.username) {
      const existingUser = await User.findOne({
        username: updateData.username,
        clerkId: { $ne: clerkId },
      });

      if (existingUser) {
        return {
          success: false,
          error: "Username already exists",
          profileComplete: false,
        };
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { clerkId },
      {
        ...updateData,
        updated_at: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return {
        success: false,
        error: "User not found",
        profileComplete: false,
      };
    }

    if (updateData.full_name || updateData.username || updateData.phone) {
      try {
        const clerkUpdateData: any = {};

        if (updateData.full_name) {
          const nameParts = updateData.full_name.trim().split(" ");
          clerkUpdateData.firstName = nameParts[0] || "";
          clerkUpdateData.lastName = nameParts.slice(1).join(" ") || "";
        }

        if (updateData.username) {
          clerkUpdateData.username = updateData.username;
        }

        if (updateData.phone) {
          clerkUpdateData.phoneNumber = updateData.phone;
        }
        const clerk = await clerkClient();
        await clerk.users.updateUser(clerkId, clerkUpdateData);
      } catch (clerkError) {
        console.error("Clerk update error:", clerkError);
      }
    }

    return getCompleteUserProfile(clerkId);
  } catch (error: any) {
    console.error("Update profile error:", error);

    if (error.code === 11000) {
      return {
        success: false,
        error: "Username already exists",
        profileComplete: false,
      };
    }

    return {
      success: false,
      error: "Failed to update profile",
      profileComplete: false,
    };
  }
};

export const uploadUserAvatar = async (clerkId: string, avatarFile: File) => {
  try {
    await connectToDatabase();

    if (!avatarFile.type.startsWith("image/")) {
      return {
        success: false,
        error: "Only image files are allowed",
      };
    }

    if (avatarFile.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: "File size must be less than 5MB",
      };
    }

    const fileUploadResult = await uploadFileToCloudinary(
      avatarFile,
      "avatars",
      clerkId
    );

    if (!fileUploadResult.success || !fileUploadResult.file) {
      return {
        success: false,
        error: fileUploadResult.error || "Failed to upload avatar",
      };
    }

    const fileId = fileUploadResult.file.id;
    const avatarUrl = fileUploadResult.file.url;

    await User.findOneAndUpdate(
      { clerkId },
      {
        avatar: fileId,
        updated_at: new Date(),
      }
    );

    try {
      const clerk = await clerkClient();
      await clerk.users.updateUser(clerkId, {
        profileImageID: avatarUrl, // Changed from profileImageUrl
      });
    } catch (clerkError) {
      console.error("Clerk avatar update error:", clerkError);
    }

    const completeProfile = await getCompleteUserProfile(clerkId);

    return {
      success: true,
      data: {
        avatar_url: avatarUrl,
        profile: completeProfile.data,
      },
      message: "Avatar uploaded successfully",
    };
  } catch (error: any) {
    console.error("Avatar upload error:", error);
    return {
      success: false,
      error: "Failed to upload avatar",
    };
  }
};

export const removeUserAvatar = async (clerkId: string) => {
  try {
    await connectToDatabase();

    await User.findOneAndUpdate(
      { clerkId },
      {
        $unset: { avatar: 1 },
        updated_at: new Date(),
      }
    );

    try {
      const clerk = await clerkClient();
      await clerk.users.updateUser(clerkId, {
        profileImageID: "", // Changed from profileImageUrl
      });
    } catch (clerkError) {
      console.error("Clerk avatar removal error:", clerkError);
    }

    return getCompleteUserProfile(clerkId);
  } catch (error: any) {
    console.error("Remove avatar error:", error);
    return {
      success: false,
      error: "Failed to remove avatar",
      profileComplete: false,
    };
  }
};
