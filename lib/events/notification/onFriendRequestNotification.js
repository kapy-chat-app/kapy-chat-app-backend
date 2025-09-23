import Notification from "../../../database/notification.model.ts";

/**
 * Handle friend request notification events
 * @param {Object} data - Friend request notification data
 * @param {string} data.requester_id - ID of the user sending friend request
 * @param {string} data.recipient_id - ID of the user receiving friend request
 * @param {string} data.request_id - Friend request ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export default async function onFriendRequestNotification(
  data,
  io,
  onlineUsers
) {
  try {
    const { requester_id, recipient_id, request_id } = data;

    console.log(
      `👥 Friend request notification: ${requester_id} sent friend request to ${recipient_id}`
    );

    // Validate required fields
    if (!requester_id || !recipient_id || !request_id) {
      throw new Error("Missing required friend request notification fields");
    }

    // Create friend request notification in database
    const notification = await Notification.createNotification({
      recipientId: recipient_id,
      senderId: requester_id,
      type: "friend_request",
      title: "New Friend Request",
      content: "You have a new friend request",
      data: {
        request_id,
        requester_id,
        recipient_id,
        status: "pending",
      },
      deliveryMethod: "in_app",
    });

    console.log(
      `✅ Friend request notification created with ID: ${notification._id}`
    );

    // Find recipient socket
    const recipientUser = onlineUsers.find(
      (user) => user.userId === recipientId
    );
    const recipientSocket = recipientUser
      ? io.sockets.sockets.get(recipientUser.socketId)
      : null;

    // Emit to recipient if online
    if (recipientSocket) {
      recipientSocket.emit("friendRequestReceived", {
        notification_id: notification._id,
        request_id,
        requester_id,
        timestamp: new Date(),
      });

      // Mark as delivered
      await notification.markAsDelivered();
      console.log(
        `📤 Friend request notification sent to online user: ${recipientId}`
      );
    } else {
      console.log(
        `📱 User ${recipientId} is offline, friend request notification will be delivered when they come online`
      );
    }

    // Emit to sender for confirmation
    const senderUser = onlineUsers.find((user) => user.userId === senderId);
    const senderSocket = senderUser
      ? io.sockets.sockets.get(senderUser.socketId)
      : null;

    if (senderSocket) {
      senderSocket.emit("friendRequestSent", {
        notification_id: notification._id,
        request_id,
        recipient_id,
        timestamp: new Date(),
      });
    }

    // Update friend request count for recipient
    await updateFriendRequestCount(recipientId, io, onlineUsers);

    return {
      success: true,
      notification_id: notification._id,
      request_id,
      delivered: !!recipientSocket,
    };
  } catch (error) {
    console.error("❌ Error creating friend request notification:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Handle friend request accepted notification
 */
export async function onFriendRequestAccepted(data, io, onlineUsers) {
  try {
    const { request_id, requester_id, recipient_id, accepted_by } = data;
    console.log(`✅ Friend request ${request_id} accepted by ${accepted_by}`);

    // Create notification for the person who sent the request
    const notification = await Notification.createNotification({
      recipientId: requester_id,
      senderId: accepted_by,
      type: "friend_request",
      title: "Friend Request Accepted",
      content: "Your friend request has been accepted",
      data: {
        request_id,
        requester_id,
        recipient_id,
        accepted_by,
        status: "accepted",
      },
      deliveryMethod: "in_app",
    });

    // Emit to both users
    const senderUser = onlineUsers.find((user) => user.userId === requester_id);
    const senderSocket = senderUser
      ? io.sockets.sockets.get(senderUser.socketId)
      : null;

    const recipientUser = onlineUsers.find(
      (user) => user.userId === recipient_id
    );
    const recipientSocket = recipientUser
      ? io.sockets.sockets.get(recipientUser.socketId)
      : null;

    if (senderSocket) {
      senderSocket.emit("friendRequestAccepted", {
        notification_id: notification._id,
        request_id,
        accepted_by,
        new_friend_id: accepted_by,
        timestamp: new Date(),
      });

      await notification.markAsDelivered();
    }

    if (recipientSocket) {
      recipientSocket.emit("friendRequestAccepted", {
        request_id,
        accepted_by,
        new_friend_id: requester_id,
        timestamp: new Date(),
      });
    }

    // Update friend counts for both users
    await updateFriendRequestCount(requester_id, io, onlineUsers);
    await updateFriendRequestCount(recipient_id, io, onlineUsers);

    return {
      success: true,
      notification_id: notification._id,
      request_id,
    };
  } catch (error) {
    console.error("❌ Error handling friend request accepted:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle friend request declined notification
 */
export async function onFriendRequestDeclined(data, io, onlineUsers) {
  try {
    const { requestId, senderId, recipientId, declinedBy } = data;
    console.log(`❌ Friend request ${requestId} declined by ${declinedBy}`);

    // Create notification for the person who sent the request
    const notification = await Notification.createNotification({
      recipientId: senderId,
      senderId: declinedBy,
      type: "friend_request",
      title: "Friend Request Declined",
      content: "Your friend request has been declined",
      data: {
        requestId,
        senderId,
        recipientId,
        declinedBy,
        status: "declined",
      },
      deliveryMethod: "in_app",
    });

    // Emit to sender
    const senderUser = onlineUsers.find((user) => user.userId === senderId);
    const senderSocket = senderUser
      ? io.sockets.sockets.get(senderUser.socketId)
      : null;

    if (senderSocket) {
      senderSocket.emit("friendRequestDeclined", {
        notificationId: notification._id,
        requestId,
        declinedBy,
        timestamp: new Date(),
      });

      await notification.markAsDelivered();
    }

    // Update friend request count for sender
    await updateFriendRequestCount(senderId, io, onlineUsers);

    return {
      success: true,
      notificationId: notification._id,
      requestId,
    };
  } catch (error) {
    console.error("❌ Error handling friend request declined:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle friend request cancelled notification
 */
export async function onFriendRequestCancelled(data, io, onlineUsers) {
  try {
    const { requestId, senderId, recipientId, cancelledBy } = data;
    console.log(`🚫 Friend request ${requestId} cancelled by ${cancelledBy}`);

    // Create notification for the recipient
    const notification = await Notification.createNotification({
      recipientId,
      senderId: cancelledBy,
      type: "friend_request",
      title: "Friend Request Cancelled",
      content: "A friend request has been cancelled",
      data: {
        requestId,
        senderId,
        recipientId,
        cancelledBy,
        status: "cancelled",
      },
      deliveryMethod: "in_app",
    });

    // Emit to recipient
    const recipientUser = onlineUsers.find(
      (user) => user.userId === recipientId
    );
    const recipientSocket = recipientUser
      ? io.sockets.sockets.get(recipientUser.socketId)
      : null;

    if (recipientSocket) {
      recipientSocket.emit("friendRequestCancelled", {
        notificationId: notification._id,
        requestId,
        cancelledBy,
        timestamp: new Date(),
      });

      await notification.markAsDelivered();
    }

    // Update friend request count for recipient
    await updateFriendRequestCount(recipientId, io, onlineUsers);

    return {
      success: true,
      notificationId: notification._id,
      requestId,
    };
  } catch (error) {
    console.error("❌ Error handling friend request cancelled:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle friend removed notification
 */
export async function onFriendRemoved(data, io, onlineUsers) {
  try {
    const { removedUserId, removedBy, friendshipId } = data;
    console.log(`👥 Friend ${removedUserId} removed by ${removedBy}`);

    // Create notification for the removed friend
    const notification = await Notification.createNotification({
      recipientId: removedUserId,
      senderId: removedBy,
      type: "friend_request",
      title: "Friend Removed",
      content: "You have been removed from someone's friend list",
      data: {
        friendshipId,
        removedUserId,
        removedBy,
        status: "removed",
      },
      deliveryMethod: "in_app",
    });

    // Emit to removed friend
    const removedUser = onlineUsers.find(
      (user) => user.userId === removedUserId
    );
    const removedSocket = removedUser
      ? io.sockets.sockets.get(removedUser.socketId)
      : null;

    if (removedSocket) {
      removedSocket.emit("friendRemoved", {
        notificationId: notification._id,
        friendshipId,
        removedBy,
        timestamp: new Date(),
      });

      await notification.markAsDelivered();
    }

    // Emit to remover
    const removerUser = onlineUsers.find((user) => user.userId === removedBy);
    const removerSocket = removerUser
      ? io.sockets.sockets.get(removerUser.socketId)
      : null;

    if (removerSocket) {
      removerSocket.emit("friendRemoved", {
        friendshipId,
        removedUserId,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      notificationId: notification._id,
      friendshipId,
    };
  } catch (error) {
    console.error("❌ Error handling friend removed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle friend online/offline status notification
 */
export async function onFriendStatusChange(data, io, onlineUsers) {
  try {
    const { userId, status, friendIds } = data;
    console.log(`👥 Friend ${userId} is now ${status}`);

    // Emit to all friends
    for (const friendId of friendIds) {
      const friendUser = onlineUsers.find((user) => user.userId === friendId);
      const friendSocket = friendUser
        ? io.sockets.sockets.get(friendUser.socketId)
        : null;

      if (friendSocket) {
        friendSocket.emit("friendStatusChanged", {
          friendId: userId,
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
async function updateFriendRequestCount(userId, io, onlineUsers) {
  try {
    // This would typically get friend request count from database
    // For now, we'll emit a placeholder count
    const userSocket = findUserSocket(userId, io, onlineUsers);

    if (userSocket) {
      userSocket.emit("friendRequestCountUpdated", {
        count: 1, // This should be calculated from database
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error("Error updating friend request count:", error);
  }
}

/**
 * Find user socket helper
 */
function findUserSocket(userId, io, onlineUsers) {
  const user = onlineUsers.find((u) => u.userId === userId);
  return user ? io.sockets.sockets.get(user.socketId) : null;
}
