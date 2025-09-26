/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import Friendship from "@/database/friendship.model";
import {
  SearchUserDto,
  SearchUserResponseDto,
  SendFriendRequestDto,
  RespondFriendRequestDto,
  GetFriendsDto,
  FriendDto,
  UserProfileDto,
  FriendSuggestionDto,
  BlockUserDto,
  UnblockUserDto,
  GetBlockedUsersDto,
  BlockedUserDto,
  FriendRequestDto,
  GetFriendRequestsDto,
} from "@/dtos/friend.dto";
import { connectToDatabase } from "../mongoose";
import User from "@/database/user.model";
import { StringExpression } from "mongoose";

// Tìm kiếm người dùng
export async function searchUsers(
  clerkId: string,
  params: SearchUserDto
): Promise<SearchUserResponseDto[]> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { query, limit = 10, excludeCurrentUser = true } = params;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Build search query
    const searchQuery: any = {
      $or: [
        { username: { $regex: query, $options: "i" } },
        { full_name: { $regex: query, $options: "i" } },
      ],
    };

    if (excludeCurrentUser) {
      searchQuery._id = { $ne: currentUserData._id };
    }

    const users = await User.find(searchQuery)
      .select("username full_name avatar bio is_online")
      .populate('avatar', 'url') // Populate avatar để lấy URL
      .limit(limit)
      .lean();

    // Get friendship status for each user
    const userIds = users.map((u) => u._id);
    const friendships = await Friendship.find({
      $or: [
        { requester: currentUserData._id, recipient: { $in: userIds } },
        { requester: { $in: userIds }, recipient: currentUserData._id },
      ],
    }).lean();

    // Get mutual friends count
    const currentUserFriends = await Friendship.find({
      $or: [
        { requester: currentUserData._id, status: "accepted" },
        { recipient: currentUserData._id, status: "accepted" },
      ],
    }).lean();

    const currentUserFriendIds = currentUserFriends.map((f) =>
      f.requester.toString() === currentUserData._id.toString()
        ? f.recipient
        : f.requester
    );

    const result: SearchUserResponseDto[] = await Promise.all(
      users.map(async (user) => {
        const friendship = friendships.find(
          (f) =>
            f.requester.toString() === (user._id as string).toString() ||
            f.recipient.toString() === (user._id as string).toString()
        );

        let friendshipStatus:
          | "none"
          | "pending"
          | "accepted"
          | "sent"
          | "blocked" = "none";
        if (friendship) {
          if (friendship.status === "accepted") friendshipStatus = "accepted";
          else if (friendship.status === "blocked")
            friendshipStatus = "blocked";
          else if (friendship.status === "pending") {
            friendshipStatus =
              friendship.requester.toString() === currentUserData._id.toString()
                ? "sent"
                : "pending";
          }
        }

        // Count mutual friends
        const userFriends = await Friendship.find({
          $or: [
            { requester: user._id, status: "accepted" },
            { recipient: user._id, status: "accepted" },
          ],
        }).lean();

        const userFriendIds = userFriends.map((f) =>
          f.requester.toString() === (user._id as string).toString()
            ? f.recipient.toString()
            : f.requester.toString()
        );

        const mutualFriendsCount = currentUserFriendIds.filter((id) =>
          userFriendIds.includes(id.toString())
        ).length;

        return {
          id: (user._id as string).toString(),
          username: user.username,
          full_name: user.full_name,
          avatar: user.avatar?.url || null, // Lấy URL từ populated avatar
          bio: user.bio,
          is_online: user.is_online,
          mutualFriendsCount,
          friendshipStatus,
        };
      })
    );

    return result;
  } catch (error) {
    console.error("Error searching users:", error);
    throw error;
  }
}

// Gửi lời mời kết bạn
export async function sendFriendRequest(
  clerkId: string,
  params: SendFriendRequestDto
): Promise<{ success: boolean; message: string }> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { recipientId } = params;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    const recipient = await User.findById(recipientId);
    if (!recipient) throw new Error("Recipient not found");

    if (currentUserData._id.toString() === recipientId) {
      throw new Error("Cannot send friend request to yourself");
    }

    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      $or: [
        { requester: currentUserData._id, recipient: recipientId },
        { requester: recipientId, recipient: currentUserData._id },
      ],
    });

    if (existingFriendship) {
      if (existingFriendship.status === "accepted") {
        return { success: false, message: "Already friends" };
      }
      if (existingFriendship.status === "pending") {
        return { success: false, message: "Friend request already sent" };
      }
      if (existingFriendship.status === "blocked") {
        return { success: false, message: "Cannot send friend request" };
      }
    }

    // Create new friendship request
    await Friendship.create({
      requester: currentUserData._id,
      recipient: recipientId,
      status: "pending",
    });

    return { success: true, message: "Friend request sent successfully" };
  } catch (error) {
    console.error("Error sending friend request:", error);
    throw error;
  }
}

// Phản hồi lời mời kết bạn
export async function respondToFriendRequest(
  clerkId: string,
  params: RespondFriendRequestDto
): Promise<{ success: boolean; message: string }> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { requestId, action } = params;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    const friendship = await Friendship.findById(requestId);
    if (!friendship) throw new Error("Friend request not found");

    if (friendship.recipient.toString() !== currentUserData._id.toString()) {
      throw new Error("Unauthorized to respond to this request");
    }

    if (friendship.status !== "pending") {
      throw new Error("Friend request is not pending");
    }

    friendship.status =
      action === "accept"
        ? "accepted"
        : action === "block"
        ? "blocked"
        : "declined";
    await friendship.save();

    const messages = {
      accept: "Friend request accepted",
      decline: "Friend request declined",
      block: "User blocked",
    };

    return { success: true, message: messages[action] };
  } catch (error) {
    console.error("Error responding to friend request:", error);
    throw error;
  }
}

// Lấy danh sách bạn bè
export async function getFriends(
  clerkId: string,
  params: GetFriendsDto
): Promise<{ friends: FriendDto[]; totalCount: number }> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { page = 1, limit = 20, search, status } = params;
    const skip = (page - 1) * limit;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Build query
    const matchQuery: any = {
      $or: [
        { requester: currentUserData._id, status: "accepted" },
        { recipient: currentUserData._id, status: "accepted" },
      ],
    };

    const friendships = await Friendship.find(matchQuery)
      .populate({
        path: "requester",
        select: "username full_name avatar is_online last_seen",
        populate: {
          path: "avatar",
          select: "url"
        }
      })
      .populate({
        path: "recipient",
        select: "username full_name avatar is_online last_seen",
        populate: {
          path: "avatar",
          select: "url"
        }
      })
      .sort({ accepted_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let friends = friendships.map((friendship) => {
      const friend =
        friendship.requester._id.toString() === currentUserData._id.toString()
          ? friendship.recipient
          : friendship.requester;

      return {
        id: friend._id.toString(),
        username: friend.username,
        full_name: friend.full_name,
        avatar: friend.avatar?.url || null, // Lấy URL từ populated avatar
        is_online: friend.is_online,
        last_seen: friend.last_seen,
        mutualFriendsCount: 0, // Will calculate if needed
        friendshipDate: friendship.accepted_at || friendship.created_at,
      };
    });

    // Filter by search
    if (search) {
      friends = friends.filter(
        (friend) =>
          friend.username.toLowerCase().includes(search.toLowerCase()) ||
          friend.full_name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Filter by status
    if (status === "online") {
      friends = friends.filter((friend) => friend.is_online);
    }

    const totalCount = await Friendship.countDocuments(matchQuery);

    return { friends, totalCount };
  } catch (error) {
    console.error("Error getting friends:", error);
    throw error;
  }
}

// Xem profile người dùng
export async function getUserProfile(
  clerkId: string,
  userId: string
): Promise<UserProfileDto> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Populate avatar and cover_photo để lấy URL
    const targetUser = await User.findById(userId)
      .populate('avatar', 'url')
      .populate('cover_photo', 'url')
      .lean() as any; // Type cast để tránh TypeScript error
    
    if (!targetUser) throw new Error("User not found");

    // Get friendship status
    const friendship = await Friendship.findOne({
      $or: [
        { requester: currentUserData._id, recipient: userId },
        { requester: userId, recipient: currentUserData._id },
      ],
    });

    let friendshipStatus: "none" | "pending" | "accepted" | "sent" | "blocked" =
      "none";
    if (friendship) {
      if (friendship.status === "accepted") friendshipStatus = "accepted";
      else if (friendship.status === "blocked") friendshipStatus = "blocked";
      else if (friendship.status === "pending") {
        friendshipStatus =
          friendship.requester.toString() === currentUserData._id.toString()
            ? "sent"
            : "pending";
      }
    }

    // Count friends
    const friendsCount = await Friendship.countDocuments({
      $or: [
        { requester: userId, status: "accepted" },
        { recipient: userId, status: "accepted" },
      ],
    });

    // Count mutual friends
    const currentUserFriends = await Friendship.find({
      $or: [
        { requester: currentUserData._id, status: "accepted" },
        { recipient: currentUserData._id, status: "accepted" },
      ],
    });

    const currentUserFriendIds = currentUserFriends.map((f) =>
      f.requester.toString() === currentUserData._id.toString()
        ? f.recipient.toString()
        : f.requester.toString()
    );

    const targetUserFriends = await Friendship.find({
      $or: [
        { requester: userId, status: "accepted" },
        { recipient: userId, status: "accepted" },
      ],
    });

    const targetUserFriendIds = targetUserFriends.map((f) =>
      f.requester.toString() === userId
        ? f.recipient.toString()
        : f.requester.toString()
    );

    const mutualFriendsCount = currentUserFriendIds.filter((id) =>
      targetUserFriendIds.includes(id)
    ).length;

    // Check if can view profile based on privacy settings
    const canViewProfile =
      targetUser.privacy_settings?.profile_visibility === "public" ||
      friendshipStatus === "accepted" ||
      currentUserData._id.toString() === userId;

    return {
      id: targetUser._id.toString(),
      username: targetUser.username,
      full_name: targetUser.full_name,
      bio: canViewProfile ? targetUser.bio : undefined,
      avatar: targetUser.avatar?.url || null, // Lấy URL từ populated avatar
      cover_photo: canViewProfile
        ? targetUser.cover_photo?.url || null // Lấy URL từ populated cover_photo
        : undefined,
      location: canViewProfile ? targetUser.location : undefined,
      website: canViewProfile ? targetUser.website : undefined,
      is_online: targetUser.is_online,
      last_seen: canViewProfile ? targetUser.last_seen : undefined,
      status: canViewProfile ? targetUser.status : undefined,
      friendsCount,
      mutualFriendsCount,
      friendshipStatus,
      canViewProfile,
    };
  } catch (error) {
    console.error("Error getting user profile:", error);
    throw error;
  }
}

// Đề xuất kết bạn
export async function getFriendSuggestions(
  clerkId: string,
  limit = 10
): Promise<FriendSuggestionDto[]> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Get current user's friends
    const userFriends = await Friendship.find({
      $or: [
        { requester: currentUserData._id, status: "accepted" },
        { recipient: currentUserData._id, status: "accepted" },
      ],
    }).lean();

    const friendIds = userFriends.map((f) =>
      f.requester.toString() === currentUserData._id.toString()
        ? f.recipient
        : f.requester
    );

    // Get existing friend requests/friendships to exclude
    const existingConnections = await Friendship.find({
      $or: [
        { requester: currentUserData._id },
        { recipient: currentUserData._id },
      ],
    }).lean();

    const excludeIds = existingConnections.map((f) =>
      f.requester.toString() === currentUserData._id.toString()
        ? f.recipient.toString()
        : f.requester.toString()
    );
    excludeIds.push(currentUserData._id.toString());

    // Find friends of friends (mutual friends suggestions)
    const friendsOfFriends = await Friendship.find({
      $or: [
        { requester: { $in: friendIds }, status: "accepted" },
        { recipient: { $in: friendIds }, status: "accepted" },
      ],
    })
      .populate("requester recipient", "username full_name avatar bio location")
      .lean();

    const suggestions = new Map<string, any>();

    for (const friendship of friendsOfFriends) {
      const suggestedUser =
        friendship.requester._id.toString() === currentUserData._id.toString()
          ? friendship.recipient
          : friendship.requester;

      const suggestedUserId = suggestedUser._id.toString();

      if (excludeIds.includes(suggestedUserId)) continue;

      if (!suggestions.has(suggestedUserId)) {
        suggestions.set(suggestedUserId, {
          id: suggestedUserId,
          username: suggestedUser.username,
          full_name: suggestedUser.full_name,
          avatar: suggestedUser.avatar?.toString(),
          bio: suggestedUser.bio,
          mutualFriendsCount: 0,
          mutualFriends: [],
          suggestionReason: "mutual_friends",
        });
      }

      suggestions.get(suggestedUserId).mutualFriendsCount++;
    }

    // Add location-based suggestions if available
    if (currentUserData.location) {
      const locationSuggestions = await User.find({
        location: { $regex: currentUserData.location, $options: "i" },
        _id: { $nin: excludeIds },
      })
        .select("username full_name avatar bio location")
        .limit(5)
        .lean();

      for (const user of locationSuggestions) {
        const userId = (user._id as StringExpression).toString();
        if (!suggestions.has(userId)) {
          suggestions.set(userId, {
            id: userId,
            username: user.username,
            full_name: user.full_name,
            avatar: user.avatar?.toString(),
            bio: user.bio,
            mutualFriendsCount: 0,
            mutualFriends: [],
            suggestionReason: "location",
          });
        }
      }
    }

    // Sort by mutual friends count and return top suggestions
    const sortedSuggestions = Array.from(suggestions.values())
      .sort((a, b) => b.mutualFriendsCount - a.mutualFriendsCount)
      .slice(0, limit);

    return sortedSuggestions;
  } catch (error) {
    console.error("Error getting friend suggestions:", error);
    throw error;
  }
}

// Chặn người dùng
export async function blockUser(
  clerkId: string,
  params: BlockUserDto
): Promise<{ success: boolean; message: string }> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { userId, reason } = params;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    const targetUser = await User.findById(userId);
    if (!targetUser) throw new Error("User to block not found");

    if (currentUserData._id.toString() === userId) {
      throw new Error("Cannot block yourself");
    }

    // Check if there's an existing friendship/relationship
    const existingFriendship = await Friendship.findOne({
      $or: [
        { requester: currentUserData._id, recipient: userId },
        { requester: userId, recipient: currentUserData._id },
      ],
    });

    if (existingFriendship) {
      // Update existing relationship to blocked
      existingFriendship.status = "blocked";
      // Make sure the current user is always the one doing the blocking
      if (
        existingFriendship.recipient.toString() ===
        currentUserData._id.toString()
      ) {
        // Swap requester and recipient so current user is the requester (blocker)
        const temp = existingFriendship.requester;
        existingFriendship.requester = existingFriendship.recipient;
        existingFriendship.recipient = temp;
      }
      await existingFriendship.save();
    } else {
      // Create new blocked relationship
      await Friendship.create({
        requester: currentUserData._id,
        recipient: userId,
        status: "blocked",
      });
    }

    return { success: true, message: "User blocked successfully" };
  } catch (error) {
    console.error("Error blocking user:", error);
    throw error;
  }
}

// Bỏ chặn người dùng
export async function unblockUser(
  clerkId: string,
  params: UnblockUserDto
): Promise<{ success: boolean; message: string }> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { userId } = params;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Find the blocked relationship where current user is the blocker
    const blockedRelationship = await Friendship.findOne({
      requester: currentUserData._id,
      recipient: userId,
      status: "blocked",
    });

    if (!blockedRelationship) {
      return { success: false, message: "User is not blocked" };
    }

    // Remove the blocked relationship entirely
    await Friendship.findByIdAndDelete(blockedRelationship._id);

    return { success: true, message: "User unblocked successfully" };
  } catch (error) {
    console.error("Error unblocking user:", error);
    throw error;
  }
}

// Lấy danh sách người dùng đã chặn
export async function getBlockedUsers(
  clerkId: string,
  params: GetBlockedUsersDto
): Promise<{ blockedUsers: BlockedUserDto[]; totalCount: number }> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Build query for blocked users (where current user is the blocker)
    const matchQuery: any = {
      requester: currentUserData._id,
      status: "blocked",
    };

    const blockedRelationships = await Friendship.find(matchQuery)
      .populate({
        path: "recipient",
        select: "username full_name avatar",
        populate: {
          path: "avatar",
          select: "url"
        }
      })
      .sort({ updated_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let blockedUsers = blockedRelationships.map((relationship) => ({
      id: relationship.recipient._id.toString(),
      username: relationship.recipient.username,
      full_name: relationship.recipient.full_name,
      avatar: relationship.recipient.avatar?.url || null,
      blockedAt: relationship.updated_at,
      reason: undefined, // You can add a reason field to the Friendship model if needed
    }));

    // Filter by search if provided
    if (search) {
      blockedUsers = blockedUsers.filter(
        (user) =>
          user.username.toLowerCase().includes(search.toLowerCase()) ||
          user.full_name.toLowerCase().includes(search.toLowerCase())
      );
    }

    const totalCount = await Friendship.countDocuments(matchQuery);

    return { blockedUsers, totalCount };
  } catch (error) {
    console.error("Error getting blocked users:", error);
    throw error;
  }
}

// Kiểm tra xem có bị chặn bởi user khác không
export async function isBlockedByUser(
  clerkId: string,
  userId: string
): Promise<boolean> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Check if the other user has blocked current user
    const isBlocked = await Friendship.findOne({
      requester: userId,
      recipient: currentUserData._id,
      status: "blocked",
    });

    return !!isBlocked;
  } catch (error) {
    console.error("Error checking if blocked by user:", error);
    return false;
  }
}

// Kiểm tra xem current user có chặn user khác không
export async function hasBlockedUser(
  clerkId: string,
  userId: string
): Promise<boolean> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Check if current user has blocked the other user
    const hasBlocked = await Friendship.findOne({
      requester: currentUserData._id,
      recipient: userId,
      status: "blocked",
    });

    return !!hasBlocked;
  } catch (error) {
    console.error("Error checking if user is blocked:", error);
    return false;
  }
}

export async function getFriendRequests(
  clerkId: string,
  params: GetFriendRequestsDto
): Promise<{ requests: FriendRequestDto[]; totalCount: number }> {
  try {
    if (!clerkId) throw new Error("Unauthorized");

    await connectToDatabase();

    const { page = 1, limit = 20, type = 'received' } = params;
    const skip = (page - 1) * limit;

    const currentUserData = await User.findOne({ clerkId });
    if (!currentUserData) throw new Error("User not found");

    // Build query based on request type
    let matchQuery: any = {};
    
    switch (type) {
      case 'received':
        // Requests sent TO current user (current user is recipient)
        matchQuery = {
          recipient: currentUserData._id,
          status: 'pending'
        };
        break;
      case 'sent':
        // Requests sent BY current user (current user is requester)
        matchQuery = {
          requester: currentUserData._id,
          status: 'pending'
        };
        break;
      case 'all':
        // All pending requests involving current user
        matchQuery = {
          $or: [
            { recipient: currentUserData._id, status: 'pending' },
            { requester: currentUserData._id, status: 'pending' }
          ]
        };
        break;
      default:
        matchQuery = {
          recipient: currentUserData._id,
          status: 'pending'
        };
    }

    const friendRequests = await Friendship.find(matchQuery)
      .populate({
        path: 'requester',
        select: 'username full_name avatar',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      })
      .populate({
        path: 'recipient', 
        select: 'username full_name avatar',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const requests: FriendRequestDto[] = friendRequests.map((request) => ({
      id: (request._id as StringConstructor).toString(),
      requester: {
        id: request.requester._id.toString(),
        username: request.requester.username,
        full_name: request.requester.full_name,
        avatar: request.requester.avatar?.url || null,
      },
      recipient: {
        id: request.recipient._id.toString(),
        username: request.recipient.username,
        full_name: request.recipient.full_name,
        avatar: request.recipient.avatar?.url || null,
      },
      status: request.status,
      created_at: request.created_at,
      updated_at: request.updated_at,
    }));

    const totalCount = await Friendship.countDocuments(matchQuery);

    return { requests, totalCount };
  } catch (error) {
    console.error("Error getting friend requests:", error);
    throw error;
  }
}