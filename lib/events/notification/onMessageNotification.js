import Notification from "../../../database/notification.model.ts";

/**
 * Handle message notification events
 * @param {Object} data - Message notification data
 * @param {string} data.sender_id - ID of the message sender
 * @param {string} data.recipient_id - ID of the message recipient
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.message_id - Message ID
 * @param {string} data.message_type - Type of message ('text', 'image', 'file', 'audio', 'video')
 * @param {string} data.message_content - Message content (for text messages)
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export default async function onMessageNotification(data, io, onlineUsers) {
  try {
    const {
      sender_id,
      recipient_id,
      conversation_id,
      message_id,
      message_type,
      message_content,
    } = data;

    console.log(
      `💬 Message notification: ${message_type} message from ${sender_id} to ${recipient_id}`
    );

    // Validate required fields
    if (
      !sender_id ||
      !recipient_id ||
      !conversation_id ||
      !message_id ||
      !message_type
    ) {
      throw new Error("Missing required message notification fields");
    }

    // Validate message type
    const validTypes = [
      "text",
      "image",
      "file",
      "audio",
      "video",
      "voice_note",
      "location",
      "call_log",
    ];
    if (!validTypes.includes(message_type)) {
      throw new Error(`Invalid message type: ${message_type}`);
    }

    // Create message notification in database
    const notification = await Notification.createNotification({
      recipientId: recipient_id,
      senderId: sender_id,
      type: "message",
      title: "New Message",
      content: getMessageNotificationContent(message_type, message_content),
      data: {
        conversation_id,
        message_id,
        message_type,
        message_content: message_type === "text" ? message_content : null,
        sender_id,
      },
      deliveryMethod: "in_app",
    });

    console.log(`✅ Message notification created with ID: ${notification._id}`);

    // Find recipient socket
    const recipientUser = onlineUsers.find(
      (user) => user.userId === recipient_id
    );
    const recipientSocket = recipientUser
      ? io.sockets.sockets.get(recipientUser.socketId)
      : null;

    // Emit to recipient if online
    if (recipientSocket) {
      recipientSocket.emit("newMessage", {
        notification_id: notification._id,
        sender_id,
        conversation_id,
        message_id,
        message_type,
        message_content: message_type === "text" ? message_content : null,
        timestamp: new Date(),
      });

      // Mark as delivered
      await notification.markAsDelivered();
      console.log(
        `📤 Message notification sent to online user: ${recipient_id}`
      );
    } else {
      console.log(
        `📱 User ${recipient_id} is offline, message notification will be delivered when they come online`
      );
    }

    // Emit to sender for confirmation
    const senderUser = onlineUsers.find((user) => user.userId === sender_id);
    const senderSocket = senderUser
      ? io.sockets.sockets.get(senderUser.socketId)
      : null;

    if (senderSocket) {
      senderSocket.emit("messageSent", {
        notification_id: notification._id,
        recipient_id,
        conversation_id,
        message_id,
        message_type,
        timestamp: new Date(),
      });
    }

    // Update unread count for recipient
    await updateUnreadCount(recipient_id, io, onlineUsers);

    // Emit conversation update to all participants
    await emitConversationUpdate(
      conversation_id,
      {
        type: "new_message",
        message_id,
        sender_id,
        message_type,
        timestamp: new Date(),
      },
      io,
      onlineUsers
    );

    return {
      success: true,
      notification_id: notification._id,
      delivered: !!recipientSocket,
    };
  } catch (error) {
    console.error("❌ Error creating message notification:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Handle group message notification
 */
export async function onGroupMessageNotification(data, io, onlineUsers) {
  try {
    const {
      sender_id,
      participant_ids,
      conversation_id,
      message_id,
      message_type,
      message_content,
      group_name,
    } = data;

    console.log(
      `💬 Group message notification: ${message_type} message from ${sender_id} in group ${group_name}`
    );

    // Create notifications for all participants except sender
    const notifications = [];
    for (const participant_id of participant_ids) {
      if (participant_id !== sender_id) {
        const notification = await Notification.createNotification({
          recipientId: participant_id,
          senderId: sender_id,
          type: "message",
          title: `New message in ${group_name}`,
          content: getMessageNotificationContent(message_type, message_content),
          data: {
            conversation_id,
            message_id,
            message_type,
            message_content: message_type === "text" ? message_content : null,
            sender_id,
            group_name,
            is_group_message: true,
          },
          deliveryMethod: "in_app",
        });
        notifications.push(notification);
      }
    }

    // Emit to all participants
    for (const participant_id of participant_ids) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        if (participant_id === sender_id) {
          // Emit to sender
          participantSocket.emit("groupMessageSent", {
            conversation_id,
            message_id,
            message_type,
            participant_count: participant_ids.length,
            timestamp: new Date(),
          });
        } else {
          // Emit to participants
          const notification = notifications.find(
            (n) => n.recipient.toString() === participant_id
          );
          participantSocket.emit("newGroupMessage", {
            notification_id: notification?._id,
            sender_id,
            conversation_id,
            message_id,
            message_type,
            message_content: message_type === "text" ? message_content : null,
            group_name,
            timestamp: new Date(),
          });

          // Mark as delivered
          if (notification) {
            await notification.markAsDelivered();
          }
        }
      }
    }

    // Update unread counts for all participants
    for (const participant_id of participant_ids) {
      if (participant_id !== sender_id) {
        await updateUnreadCount(participant_id, io, onlineUsers);
      }
    }

    return {
      success: true,
      notificationsCreated: notifications.length,
    };
  } catch (error) {
    console.error("❌ Error creating group message notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle message read notification
 */
export async function onMessageReadNotification(data, io, onlineUsers) {
  try {
    const { message_id, conversation_id, user_id, read_at } = data;
    console.log(`👁️ Message ${message_id} read by ${user_id}`);

    // Emit to all participants in conversation
    await emitConversationUpdate(
      conversation_id,
      {
        type: "message_read",
        message_id,
        read_by: user_id,
        read_at: read_at || new Date(),
        timestamp: new Date(),
      },
      io,
      onlineUsers
    );

    return { success: true };
  } catch (error) {
    console.error("❌ Error handling message read notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle message reaction notification
 */
export async function onMessageReactionNotification(data, io, onlineUsers) {
  try {
    const {
      message_id,
      conversation_id,
      user_id,
      reaction,
      message_sender_id,
    } = data;
    console.log(
      `😊 Reaction ${reaction} added to message ${message_id} by ${user_id}`
    );

    // Create notification for message sender if different from reactor
    if (message_sender_id && message_sender_id !== user_id) {
      const notification = await Notification.createNotification({
        recipientId: message_sender_id,
        senderId: user_id,
        type: "message",
        title: "Message Reaction",
        content: `Someone reacted ${reaction} to your message`,
        data: {
          conversation_id,
          message_id,
          reaction,
          reactor_id: user_id,
        },
        deliveryMethod: "in_app",
      });

      // Emit to message sender
      const senderUser = onlineUsers.find(
        (user) => user.userId === message_sender_id
      );
      const senderSocket = senderUser
        ? io.sockets.sockets.get(senderUser.socketId)
        : null;

      if (senderSocket) {
        senderSocket.emit("messageReaction", {
          notification_id: notification._id,
          message_id,
          conversation_id,
          reaction,
          reactor_id: user_id,
          timestamp: new Date(),
        });

        await notification.markAsDelivered();
      }
    }

    // Emit to all participants in conversation
    await emitConversationUpdate(
      conversation_id,
      {
        type: "message_reaction",
        message_id,
        reaction,
        reactor_id: user_id,
        timestamp: new Date(),
      },
      io,
      onlineUsers
    );

    return { success: true };
  } catch (error) {
    console.error("❌ Error handling message reaction notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get appropriate notification content based on message type
 */
function getMessageNotificationContent(message_type, message_content) {
  switch (message_type) {
    case "text":
      return message_content || "You have a new message";
    case "image":
      return "📷 Sent a photo";
    case "file":
      return "📎 Sent a file";
    case "audio":
      return "🎵 Sent an audio message";
    case "video":
      return "🎥 Sent a video";
    case "voice_note":
      return "🎤 Sent a voice note";
    case "location":
      return "📍 Shared a location";
    case "call_log":
      return "📞 Call log";
    default:
      return "You have a new message";
  }
}

/**
 * Update unread count for user
 */
async function updateUnreadCount(user_id, io, onlineUsers) {
  try {
    const unreadNotifications = await Notification.getUnreadNotifications(
      user_id
    );
    const userSocket = findUserSocket(user_id, io, onlineUsers);

    if (userSocket) {
      userSocket.emit("unreadCountUpdated", {
        unread_count: unreadNotifications.length,
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error("Error updating unread count:", error);
  }
}

/**
 * Emit conversation update to all participants
 */
async function emitConversationUpdate(
  conversation_id,
  updateData,
  io,
  onlineUsers
) {
  try {
    // This would typically get conversation participants from database
    // For now, we'll emit to all online users (you should implement proper participant lookup)
    onlineUsers.forEach((user) => {
      const userSocket = io.sockets.sockets.get(user.socketId);
      if (userSocket) {
        userSocket.emit("conversationUpdate", {
          conversation_id,
          ...updateData,
        });
      }
    });
  } catch (error) {
    console.error("Error emitting conversation update:", error);
  }
}

/**
 * Find user socket helper
 */
function findUserSocket(user_id, io, onlineUsers) {
  const user = onlineUsers.find((u) => u.userId === user_id);
  return user ? io.sockets.sockets.get(user.socketId) : null;
}
