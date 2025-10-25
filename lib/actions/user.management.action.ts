/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/user-management.actions.ts
"use server";

import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import { clerkClient } from "@clerk/nextjs/server";
import {
  CombinedUserData,
  UserListQueryParams,
  UserListResponse,
  UserDetailResponse,
  UserStatusUpdateRequest,
  UserStatusUpdateResponse,
} from "@/dtos/user-management.dto";

/**
 * Combine MongoDB user with Clerk user data
 */
async function combineUserData(mongoUser: any): Promise<CombinedUserData> {
  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(mongoUser.clerkId);

    // Determine account status
    let accountStatus: "active" | "banned" | "locked" = "active";
    if (clerkUser.banned) accountStatus = "banned";
    else if (clerkUser.locked) accountStatus = "locked";

    // Check email verification
    const primaryEmail = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    );
    const emailVerified = primaryEmail?.verification?.status === "verified";

    // Get role from publicMetadata
    const role = (clerkUser.publicMetadata?.role as string) || "user";

    return {
      // MongoDB data
      _id: mongoUser._id.toString(),
      clerkId: mongoUser.clerkId,
      email: mongoUser.email,
      full_name: mongoUser.full_name,
      username: mongoUser.username,
      bio: mongoUser.bio,
      avatar: mongoUser.avatar?.toString(),
      cover_photo: mongoUser.cover_photo?.toString(),
      phone: mongoUser.phone,
      date_of_birth: mongoUser.date_of_birth?.toISOString(),
      gender: mongoUser.gender,
      location: mongoUser.location,
      website: mongoUser.website,
      is_online: mongoUser.is_online,
      last_seen: mongoUser.last_seen?.toISOString(),
      status: mongoUser.status,
      created_at: mongoUser.created_at.toISOString(),
      updated_at: mongoUser.updated_at.toISOString(),
      privacy_settings: mongoUser.privacy_settings,
      notification_settings: mongoUser.notification_settings,
      ai_preferences: mongoUser.ai_preferences,

      // Clerk data
      clerkData: {
        firstName: clerkUser.firstName || undefined,
        lastName: clerkUser.lastName || undefined,
        imageUrl: clerkUser.imageUrl,
        emailAddresses: clerkUser.emailAddresses.map((e: any) => ({
          emailAddress: e.emailAddress,
          verification: {
            status: e.verification?.status || "unverified",
          },
        })),
        phoneNumbers: clerkUser.phoneNumbers.map((p: any) => ({
          phoneNumber: p.phoneNumber,
        })),
        banned: clerkUser.banned,
        locked: clerkUser.locked,
        createdAt: clerkUser.createdAt,
        updatedAt: clerkUser.updatedAt,
        lastSignInAt: clerkUser.lastSignInAt || undefined,
        publicMetadata: clerkUser.publicMetadata,
      },

      // Computed fields
      displayName:
        mongoUser.full_name ||
        `${clerkUser.firstName} ${clerkUser.lastName}`.trim() ||
        mongoUser.username,
      displayAvatar: clerkUser.imageUrl || mongoUser.avatar?.toString() || "",
      accountStatus,
      emailVerified,
      role,
    };
  } catch (error) {
    console.error("Error combining user data:", error);
    throw error;
  }
}

/**
 * Get paginated user list with filters
 */
export async function getUserList(
  params: UserListQueryParams = {}
): Promise<UserListResponse> {
  try {
    await connectToDatabase();

    const {
      page = 1,
      limit = 20,
      search = "",
      status = "all",
      role = "all",
      sortBy = "created_at",
      sortOrder = "desc",
      gender = "all",
      emailVerified = "all",
    } = params;

    // Build MongoDB query
    const query: any = {};

    // Search filter
    if (search) {
      query.$or = [
        { full_name: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Gender filter
    if (gender !== "all") {
      query.gender = gender;
    }

    // Online status filter
    if (status === "online") {
      query.is_online = true;
    } else if (status === "offline") {
      query.is_online = false;
    }

    // Build sort object
    const sortObject: any = {};
    sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get total count
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    // Get users from MongoDB
    const mongoUsers = await User.find(query)
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
      .lean();

    // Combine with Clerk data and apply additional filters
    const clerk = await clerkClient();
    const combinedUsers: CombinedUserData[] = [];

    for (const mongoUser of mongoUsers) {
      try {
        const clerkUser = await clerk.users.getUser(mongoUser.clerkId);

        // Apply status filter (Clerk-based)
        if (status === "banned" && !clerkUser.banned) continue;
        if (status === "locked" && !clerkUser.locked) continue;
        if (status === "active" && (clerkUser.banned || clerkUser.locked))
          continue;

        // Apply role filter
        const userRole = (clerkUser.publicMetadata?.role as string) || "user";
        if (role !== "all" && userRole !== role) continue;

        // Apply email verification filter
        const primaryEmail = clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        );
        const isEmailVerified =
          primaryEmail?.verification?.status === "verified";
        if (emailVerified === "verified" && !isEmailVerified) continue;
        if (emailVerified === "unverified" && isEmailVerified) continue;

        const combined = await combineUserData(mongoUser);
        combinedUsers.push(combined);
      } catch (error) {
        console.error(`Error processing user ${mongoUser.clerkId}:`, error);
        continue;
      }
    }

    return {
      success: true,
      data: combinedUsers,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        applied: params,
        available: {
          statuses: ["all", "active", "banned", "locked", "online", "offline"],
          roles: ["all", "user", "admin", "moderator"],
          genders: ["all", "male", "female", "other", "private"],
        },
      },
    };
  } catch (error: any) {
    console.error("Error getting user list:", error);
    throw new Error(error.message || "Failed to get user list");
  }
}

/**
 * Get user detail by ID (MongoDB _id or clerkId)
 */
export async function getUserDetail(
  userId: string
): Promise<UserDetailResponse> {
  try {
    await connectToDatabase();

    // Try to find by MongoDB _id or clerkId
    const mongoUser = await User.findOne({
      $or: [{ _id: userId }, { clerkId: userId }],
    }).lean();

    if (!mongoUser) {
      throw new Error("User not found");
    }

    // Combine with Clerk data
    const combinedUser = await combineUserData(mongoUser);

    // Calculate statistics (you can expand this)
    const statistics = {
      totalConversations: 0, // TODO: Query from Conversation model
      totalMessages: 0, // TODO: Query from Message model
      totalCalls: 0, // TODO: Query from Call model
      totalFriends: 0, // TODO: Query from Friendship model
      accountAge: calculateAccountAge(mongoUser.created_at),
      lastActivity: mongoUser.last_seen
        ? formatLastActivity(mongoUser.last_seen)
        : "Never",
    };

    return {
      success: true,
      data: combinedUser,
      statistics,
    };
  } catch (error: any) {
    console.error("Error getting user detail:", error);
    throw new Error(error.message || "Failed to get user detail");
  }
}

/**
 * Search users (for autocomplete/suggestions)
 */
export async function searchUsers(query: string, limit: number = 10) {
  try {
    await connectToDatabase();

    if (!query || query.length < 2) {
      return { success: true, data: [] };
    }

    const users = await User.find({
      $or: [
        { full_name: { $regex: query, $options: "i" } },
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    })
      .limit(limit)
      .select("clerkId full_name username email avatar")
      .lean();

    const suggestions = users.map((user) => ({
      type: "user" as const,
      value: user.clerkId,
      label: `${user.full_name} (@${user.username})`,
      avatar: user.avatar?.toString(),
    }));

    return { success: true, data: suggestions };
  } catch (error: any) {
    console.error("Error searching users:", error);
    return { success: false, data: [] };
  }
}

/**
 * Update user status (ban/unban/lock/unlock)
 */
export async function updateUserStatus(
  request: UserStatusUpdateRequest
): Promise<UserStatusUpdateResponse> {
  try {
    const { userId, action, reason } = request;

    await connectToDatabase();

    // Find user in MongoDB
    const mongoUser = await User.findOne({
      $or: [{ _id: userId }, { clerkId: userId }],
    });

    if (!mongoUser) {
      throw new Error("User not found");
    }

    // Get current status from Clerk
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(mongoUser.clerkId);

    let previousStatus = "active";
    if (clerkUser.banned) previousStatus = "banned";
    else if (clerkUser.locked) previousStatus = "locked";

    // Perform action in Clerk
    let newStatus = previousStatus;

    switch (action) {
      case "ban":
        await clerk.users.banUser(mongoUser.clerkId);
        newStatus = "banned";
        break;
      case "unban":
        await clerk.users.unbanUser(mongoUser.clerkId);
        newStatus = "active";
        break;
      case "lock":
        await clerk.users.lockUser(mongoUser.clerkId);
        newStatus = "locked";
        break;
      case "unlock":
        await clerk.users.unlockUser(mongoUser.clerkId);
        newStatus = "active";
        break;
    }

    // Optional: Log the action in your database
    console.log(
      `User ${mongoUser.clerkId} status changed: ${previousStatus} -> ${newStatus}`,
      reason
    );

    return {
      success: true,
      message: `User ${
        action === "ban" || action === "lock" ? action + "ned" : action + "ed"
      } successfully`,
      data: {
        userId: mongoUser._id.toString(),
        clerkId: mongoUser.clerkId,
        previousStatus,
        newStatus,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error updating user status:", error);
    throw new Error(error.message || "Failed to update user status");
  }
}

/**
 * Helper: Calculate account age
 */
function calculateAccountAge(createdAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return "Today";
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""}`;
  if (diffDays < 30)
    return `${Math.floor(diffDays / 7)} week${
      Math.floor(diffDays / 7) > 1 ? "s" : ""
    }`;
  if (diffDays < 365)
    return `${Math.floor(diffDays / 30)} month${
      Math.floor(diffDays / 30) > 1 ? "s" : ""
    }`;
  return `${Math.floor(diffDays / 365)} year${
    Math.floor(diffDays / 365) > 1 ? "s" : ""
  }`;
}

/**
 * Helper: Format last activity
 */
function formatLastActivity(lastSeen: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return lastSeen.toLocaleDateString();
}
