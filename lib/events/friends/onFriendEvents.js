import Friendship from "../../../database/friendship.model.ts";
import Notification from "../../../database/notification.model.ts";
import User from "../../../database/user.model.ts";
import {
  baseEventHandler,
  eventHandlerFactory,
} from "../../core/BaseEventHandler.js";

/**
 * Handle send friend request event
 * @param {Object} data - Send friend request data
 * @param {string} data.requester_id - ID of the user sending request
 * @param {string} data.recipient_id - ID of the user receiving request
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onSendFriendRequest = eventHandlerFactory.createFriendHandler(
  async function (data, io, onlineUsers) {
    const { requester_id, recipient_id } = data;

    this.logEvent("Send Friend Request", requester_id, { recipient_id });

    // Check if users exist
    const [requester, recipient] = await Promise.all([
      User.findById(requester_id),
      User.findById(recipient_id),
    ]);

    if (!requester || !recipient) {
      throw new Error("User not found");
    }

    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      $or: [
        { requester: requester_id, recipient: recipient_id },
        { requester: recipient_id, recipient: requester_id },
      ],
    });

    if (existingFriendship) {
      throw new Error("Friendship already exists");
    }

    // Create friend request
    const friendship = await Friendship.createFriendship({
      requesterId: requester_id,
      recipientId: recipient_id,
      status: "pending",
    });

    // Emit to recipient if online
    baseEventHandler.emitToUser(
      recipient_id,
      "friendRequestReceived",
      {
        request_id: friendship._id,
        requester_id,
        requester_name: requester.name,
        requester_avatar: requester.avatar,
      },
      io,
      onlineUsers
    );

    // Emit to requester for confirmation
    baseEventHandler.emitToUser(
      requester_id,
      "friendRequestSent",
      {
        request_id: friendship._id,
        recipient_id,
        recipient_name: recipient.name,
        recipient_avatar: recipient.avatar,
      },
      io,
      onlineUsers
    );

    // Create notification for offline recipient
    if (!baseEventHandler.isUserOnline(recipient_id, onlineUsers)) {
      await Notification.createNotification({
        recipientId: recipient_id,
        senderId: requester_id,
        type: "friend_request",
        title: "New Friend Request",
        content: `${requester.name} sent you a friend request`,
        data: {
          request_id: friendship._id,
          requester_id,
          requester_name: requester.name,
          requester_avatar: requester.avatar,
        },
        deliveryMethod: "in_app",
      });
    }

    return {
      request_id: friendship._id,
      status: "pending",
    };
  }
);

/**
 * Handle accept friend request event
 * @param {Object} data - Accept friend request data
 * @param {string} data.request_id - Friend request ID
 * @param {string} data.accepted_by - User ID accepting request
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onAcceptFriendRequest(data, io, onlineUsers) {
  try {
    const { request_id, accepted_by } = data;

    console.log(`✅ Friend request ${request_id} accepted by ${accepted_by}`);

    // Update friendship status
    const friendship = await Friendship.findByIdAndUpdate(
      request_id,
      {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedBy: accepted_by,
      },
      { new: true }
    );

    if (!friendship) {
      throw new Error("Friend request not found");
    }

    const requester_id = friendship.requester.toString();
    const recipient_id = friendship.recipient.toString();

    // Get user information
    const requester = await User.findById(requester_id);
    const recipient = await User.findById(recipient_id);

    // Emit to both users
    const requesterUser = onlineUsers.find(
      (user) => user.userId === requester_id
    );
    const requesterSocket = requesterUser
      ? io.sockets.sockets.get(requesterUser.socketId)
      : null;

    const recipientUser = onlineUsers.find(
      (user) => user.userId === recipient_id
    );
    const recipientSocket = recipientUser
      ? io.sockets.sockets.get(recipientUser.socketId)
      : null;

    if (requesterSocket) {
      requesterSocket.emit("friendRequestAccepted", {
        request_id,
        accepted_by,
        new_friend_id: accepted_by,
        new_friend_name: recipient.name,
        new_friend_avatar: recipient.avatar,
        timestamp: new Date(),
      });
    }

    if (recipientSocket) {
      recipientSocket.emit("friendRequestAccepted", {
        request_id,
        accepted_by,
        new_friend_id: requester_id,
        new_friend_name: requester.name,
        new_friend_avatar: requester.avatar,
        timestamp: new Date(),
      });
    }

    // Create notification for the person who sent the request
    if (!requesterSocket) {
      await Notification.createNotification({
        recipientId: requester_id,
        senderId: accepted_by,
        type: "friend_request",
        title: "Friend Request Accepted",
        content: `${recipient.name} accepted your friend request`,
        data: {
          request_id,
          accepted_by,
          new_friend_id: accepted_by,
          status: "accepted",
        },
        deliveryMethod: "in_app",
      });
    }

    // Update friend counts for both users
    await updateFriendRequestCount(requester_id, io, onlineUsers);
    await updateFriendRequestCount(recipient_id, io, onlineUsers);
    await updateFriendCount(requester_id, io, onlineUsers);
    await updateFriendCount(recipient_id, io, onlineUsers);

    return {
      success: true,
      request_id,
      status: "accepted",
    };
  } catch (error) {
    console.error("❌ Error accepting friend request:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle decline friend request event
 * @param {Object} data - Decline friend request data
 * @param {string} data.request_id - Friend request ID
 * @param {string} data.declined_by - User ID declining request
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onDeclineFriendRequest(data, io, onlineUsers) {
  try {
    const { request_id, declined_by } = data;

    console.log(`❌ Friend request ${request_id} declined by ${declined_by}`);

    // Update friendship status
    const friendship = await Friendship.findByIdAndUpdate(
      request_id,
      {
        status: "declined",
        declinedAt: new Date(),
        declinedBy: declined_by,
      },
      { new: true }
    );

    if (!friendship) {
      throw new Error("Friend request not found");
    }

    const requester_id = friendship.requester.toString();
    const recipient_id = friendship.recipient.toString();

    // Get user information
    const recipient = await User.findById(recipient_id);

    // Emit to requester
    const requesterUser = onlineUsers.find(
      (user) => user.userId === requester_id
    );
    const requesterSocket = requesterUser
      ? io.sockets.sockets.get(requesterUser.socketId)
      : null;

    if (requesterSocket) {
      requesterSocket.emit("friendRequestDeclined", {
        request_id,
        declined_by,
        declined_by_name: recipient.name,
        timestamp: new Date(),
      });
    }

    // Create notification for the person who sent the request
    if (!requesterSocket) {
      await Notification.createNotification({
        recipientId: requester_id,
        senderId: declined_by,
        type: "friend_request",
        title: "Friend Request Declined",
        content: `${recipient.name} declined your friend request`,
        data: {
          request_id,
          declined_by,
          status: "declined",
        },
        deliveryMethod: "in_app",
      });
    }

    // Update friend request counts
    await updateFriendRequestCount(requester_id, io, onlineUsers);
    await updateFriendRequestCount(recipient_id, io, onlineUsers);

    return {
      success: true,
      request_id,
      status: "declined",
    };
  } catch (error) {
    console.error("❌ Error declining friend request:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle cancel friend request event
 * @param {Object} data - Cancel friend request data
 * @param {string} data.request_id - Friend request ID
 * @param {string} data.cancelled_by - User ID cancelling request
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onCancelFriendRequest(data, io, onlineUsers) {
  try {
    const { request_id, cancelled_by } = data;

    console.log(`🚫 Friend request ${request_id} cancelled by ${cancelled_by}`);

    // Update friendship status
    const friendship = await Friendship.findByIdAndUpdate(
      request_id,
      {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: cancelled_by,
      },
      { new: true }
    );

    if (!friendship) {
      throw new Error("Friend request not found");
    }

    const requester_id = friendship.requester.toString();
    const recipient_id = friendship.recipient.toString();

    // Get user information
    const requester = await User.findById(requester_id);

    // Emit to recipient
    const recipientUser = onlineUsers.find(
      (user) => user.userId === recipient_id
    );
    const recipientSocket = recipientUser
      ? io.sockets.sockets.get(recipientUser.socketId)
      : null;

    if (recipientSocket) {
      recipientSocket.emit("friendRequestCancelled", {
        request_id,
        cancelled_by,
        cancelled_by_name: requester.name,
        timestamp: new Date(),
      });
    }

    // Create notification for the recipient
    if (!recipientSocket) {
      await Notification.createNotification({
        recipientId: recipient_id,
        senderId: cancelled_by,
        type: "friend_request",
        title: "Friend Request Cancelled",
        content: `${requester.name} cancelled their friend request`,
        data: {
          request_id,
          cancelled_by,
          status: "cancelled",
        },
        deliveryMethod: "in_app",
      });
    }

    // Update friend request counts
    await updateFriendRequestCount(requester_id, io, onlineUsers);
    await updateFriendRequestCount(recipient_id, io, onlineUsers);

    return {
      success: true,
      request_id,
      status: "cancelled",
    };
  } catch (error) {
    console.error("❌ Error cancelling friend request:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle remove friend event
 * @param {Object} data - Remove friend data
 * @param {string} data.friendship_id - Friendship ID
 * @param {string} data.removed_by - User ID removing friend
 * @param {string} data.removed_user_id - User ID being removed
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onRemoveFriend(data, io, onlineUsers) {
  try {
    const { friendship_id, removed_by, removed_user_id } = data;

    console.log(`👥 Friend ${removed_user_id} removed by ${removed_by}`);

    // Update friendship status
    const friendship = await Friendship.findByIdAndUpdate(
      friendship_id,
      {
        status: "removed",
        removedAt: new Date(),
        removedBy: removed_by,
      },
      { new: true }
    );

    if (!friendship) {
      throw new Error("Friendship not found");
    }

    // Get user information
    const removedUser = await User.findById(removed_user_id);
    const removerUser = await User.findById(removed_by);

    // Emit to removed friend
    const removedUserOnline = onlineUsers.find(
      (user) => user.userId === removed_user_id
    );
    const removedSocket = removedUserOnline
      ? io.sockets.sockets.get(removedUserOnline.socketId)
      : null;

    if (removedSocket) {
      removedSocket.emit("friendRemoved", {
        friendship_id,
        removed_by,
        removed_by_name: removerUser.name,
        timestamp: new Date(),
      });
    }

    // Emit to remover
    const removerUserOnline = onlineUsers.find(
      (user) => user.userId === removed_by
    );
    const removerSocket = removerUserOnline
      ? io.sockets.sockets.get(removerUserOnline.socketId)
      : null;

    if (removerSocket) {
      removerSocket.emit("friendRemoved", {
        friendship_id,
        removed_user_id,
        removed_user_name: removedUser.name,
        timestamp: new Date(),
      });
    }

    // Create notification for the removed friend
    if (!removedSocket) {
      await Notification.createNotification({
        recipientId: removed_user_id,
        senderId: removed_by,
        type: "friend_request",
        title: "Friend Removed",
        content: `${removerUser.name} removed you from their friend list`,
        data: {
          friendship_id,
          removed_by,
          status: "removed",
        },
        deliveryMethod: "in_app",
      });
    }

    // Update friend counts for both users
    await updateFriendCount(removed_user_id, io, onlineUsers);
    await updateFriendCount(removed_by, io, onlineUsers);

    return {
      success: true,
      friendship_id,
      status: "removed",
    };
  } catch (error) {
    console.error("❌ Error removing friend:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle block friend event
 * @param {Object} data - Block friend data
 * @param {string} data.friendship_id - Friendship ID
 * @param {string} data.blocked_by - User ID blocking friend
 * @param {string} data.blocked_user_id - User ID being blocked
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onBlockFriend(data, io, onlineUsers) {
  try {
    const { friendship_id, blocked_by, blocked_user_id } = data;

    console.log(`🚫 Friend ${blocked_user_id} blocked by ${blocked_by}`);

    // Update friendship status
    const friendship = await Friendship.findByIdAndUpdate(
      friendship_id,
      {
        status: "blocked",
        blockedAt: new Date(),
        blockedBy: blocked_by,
      },
      { new: true }
    );

    if (!friendship) {
      throw new Error("Friendship not found");
    }

    // Get user information
    const blockedUser = await User.findById(blocked_user_id);

    // Emit to blocker
    const blockerUserOnline = onlineUsers.find(
      (user) => user.userId === blocked_by
    );
    const blockerSocket = blockerUserOnline
      ? io.sockets.sockets.get(blockerUserOnline.socketId)
      : null;

    if (blockerSocket) {
      blockerSocket.emit("friendBlocked", {
        friendship_id,
        blocked_user_id,
        blocked_user_name: blockedUser.name,
        timestamp: new Date(),
      });
    }

    // Update friend counts
    await updateFriendCount(blocked_user_id, io, onlineUsers);
    await updateFriendCount(blocked_by, io, onlineUsers);

    return {
      success: true,
      friendship_id,
      status: "blocked",
    };
  } catch (error) {
    console.error("❌ Error blocking friend:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle unblock friend event
 * @param {Object} data - Unblock friend data
 * @param {string} data.friendship_id - Friendship ID
 * @param {string} data.unblocked_by - User ID unblocking friend
 * @param {string} data.unblocked_user_id - User ID being unblocked
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onUnblockFriend(data, io, onlineUsers) {
  try {
    const { friendship_id, unblocked_by, unblocked_user_id } = data;

    console.log(`🔓 Friend ${unblocked_user_id} unblocked by ${unblocked_by}`);

    // Update friendship status
    const friendship = await Friendship.findByIdAndUpdate(
      friendship_id,
      {
        status: "accepted",
        unblockedAt: new Date(),
        unblockedBy: unblocked_by,
      },
      { new: true }
    );

    if (!friendship) {
      throw new Error("Friendship not found");
    }

    // Get user information
    const unblockedUser = await User.findById(unblocked_user_id);

    // Emit to unblocker
    const unblockerUserOnline = onlineUsers.find(
      (user) => user.userId === unblocked_by
    );
    const unblockerSocket = unblockerUserOnline
      ? io.sockets.sockets.get(unblockerUserOnline.socketId)
      : null;

    if (unblockerSocket) {
      unblockerSocket.emit("friendUnblocked", {
        friendship_id,
        unblocked_user_id,
        unblocked_user_name: unblockedUser.name,
        timestamp: new Date(),
      });
    }

    // Update friend counts
    await updateFriendCount(unblocked_user_id, io, onlineUsers);
    await updateFriendCount(unblocked_by, io, onlineUsers);

    return {
      success: true,
      friendship_id,
      status: "accepted",
    };
  } catch (error) {
    console.error("❌ Error unblocking friend:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get friends list event
 * @param {Object} data - Get friends data
 * @param {string} data.user_id - User ID requesting friends list
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetFriends(data, io, onlineUsers) {
  try {
    const { user_id } = data;

    console.log(`👥 Getting friends list for user ${user_id}`);

    // Get friends from database
    const friends = await Friendship.getFriends(user_id);

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("friendsRetrieved", {
        friends,
        friend_count: friends.length,
        timestamp: new Date(),
      });
    }

    return { success: true, friends };
  } catch (error) {
    console.error("❌ Error getting friends:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get friend requests event
 * @param {Object} data - Get friend requests data
 * @param {string} data.user_id - User ID requesting friend requests
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetFriendRequests(data, io, onlineUsers) {
  try {
    const { user_id } = data;

    console.log(`📋 Getting friend requests for user ${user_id}`);

    // Get friend requests from database
    const friendRequests = await Friendship.getFriendRequests(user_id);

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("friendRequestsRetrieved", {
        friend_requests: friendRequests,
        request_count: friendRequests.length,
        timestamp: new Date(),
      });
    }

    return { success: true, friend_requests: friendRequests };
  } catch (error) {
    console.error("❌ Error getting friend requests:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle friend online/offline status change event
 * @param {Object} data - Friend status change data
 * @param {string} data.user_id - User ID whose status changed
 * @param {string} data.status - New status ('online' or 'offline')
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onFriendStatusChange(data, io, onlineUsers) {
  try {
    const { user_id, status } = data;

    console.log(`👥 Friend ${user_id} is now ${status}`);

    // Get user's friends
    const friends = await Friendship.getFriends(user_id);
    const friendIds = friends.map((friend) =>
      friend.requester.toString() === user_id
        ? friend.recipient.toString()
        : friend.requester.toString()
    );

    // Emit to all friends
    for (const friendId of friendIds) {
      const friendUser = onlineUsers.find((user) => user.userId === friendId);
      const friendSocket = friendUser
        ? io.sockets.sockets.get(friendUser.socketId)
        : null;

      if (friendSocket) {
        friendSocket.emit("friendStatusChanged", {
          friend_id: user_id,
          status,
          timestamp: new Date(),
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Error handling friend status change:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Update friend request count for user
 */
async function updateFriendRequestCount(user_id, io, onlineUsers) {
  try {
    const friendRequestCount = await Friendship.getFriendRequestCount(user_id);
    const userSocket = findUserSocket(user_id, io, onlineUsers);

    if (userSocket) {
      userSocket.emit("friendRequestCountUpdated", {
        count: friendRequestCount,
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error("Error updating friend request count:", error);
  }
}

/**
 * Update friend count for user
 */
async function updateFriendCount(user_id, io, onlineUsers) {
  try {
    const friendCount = await Friendship.getFriendCount(user_id);
    const userSocket = findUserSocket(user_id, io, onlineUsers);

    if (userSocket) {
      userSocket.emit("friendCountUpdated", {
        count: friendCount,
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error("Error updating friend count:", error);
  }
}

/**
 * Find user socket helper
 */
function findUserSocket(user_id, io, onlineUsers) {
  const user = onlineUsers.find((u) => u.userId === user_id);
  return user ? io.sockets.sockets.get(user.socketId) : null;
}
