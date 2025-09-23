import Notification from "../../../database/notification.model.ts";

/**
 * Handle call notification events
 * @param {Object} data - Call notification data
 * @param {string} data.caller_id - ID of the caller
 * @param {string} data.recipient_id - ID of the recipient
 * @param {string} data.type - Call type ('audio' or 'video')
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.call_id - Call ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export default async function onCallNotification(data, io, onlineUsers) {
  try {
    const { caller_id, recipient_id, type, conversation_id, call_id } = data;

    console.log(
      `📞 Call notification: ${type} call from ${caller_id} to ${recipient_id}`
    );

    // Validate required fields
    if (!caller_id || !recipient_id || !type || !conversation_id) {
      throw new Error("Missing required call notification fields");
    }

    // Validate call type
    const validTypes = ["audio", "video"];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid call type: ${type}`);
    }

    // Create call notification in database
    const notification = await Notification.createNotification({
      recipientId: recipient_id,
      senderId: caller_id,
      type: "call",
      title: `Incoming ${type} call`,
      content: `You have an incoming ${type} call`,
      data: {
        call_id: call_id || `call_${Date.now()}`,
        conversation_id,
        call_type: type,
        caller_id,
      },
      deliveryMethod: "in_app",
    });

    console.log(`✅ Call notification created with ID: ${notification._id}`);

    // Find recipient socket
    const recipientUser = onlineUsers.find(
      (user) => user.userId === recipient_id
    );
    const recipientSocket = recipientUser
      ? io.sockets.sockets.get(recipientUser.socketId)
      : null;

    // Emit to recipient if online
    if (recipientSocket) {
      recipientSocket.emit("incomingCall", {
        notification_id: notification._id,
        caller_id,
        type,
        conversation_id,
        call_id: notification.data.call_id,
        timestamp: new Date(),
      });

      // Mark as delivered
      await notification.markAsDelivered();
      console.log(`📤 Call notification sent to online user: ${recipient_id}`);
    } else {
      console.log(
        `📱 User ${recipient_id} is offline, call notification will be delivered when they come online`
      );
    }

    // Emit to caller for confirmation
    const callerUser = onlineUsers.find((user) => user.userId === caller_id);
    const callerSocket = callerUser
      ? io.sockets.sockets.get(callerUser.socketId)
      : null;

    if (callerSocket) {
      callerSocket.emit("callNotificationSent", {
        notification_id: notification._id,
        recipient_id,
        type,
        conversation_id,
        call_id: notification.data.call_id,
        timestamp: new Date(),
      });
    }

    // Emit call status to all participants in conversation
    await emitCallStatusToParticipants(
      conversation_id,
      {
        type: "call_started",
        caller_id,
        recipient_id,
        call_type: type,
        call_id: notification.data.call_id,
        timestamp: new Date(),
      },
      io,
      onlineUsers
    );

    return {
      success: true,
      notification_id: notification._id,
      call_id: notification.data.call_id,
      delivered: !!recipientSocket,
    };
  } catch (error) {
    console.error("❌ Error creating call notification:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Handle call answered event
 * @param {Object} data - Call answered data
 * @param {string} data.call_id - Call ID
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID who answered
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onCallAnswered(data, io, onlineUsers) {
  try {
    const { call_id, conversation_id, user_id } = data;
    console.log(`📞 Call ${call_id} answered by ${user_id}`);

    // Emit to all participants
    await emitCallStatusToParticipants(
      conversation_id,
      {
        type: "call_answered",
        call_id,
        answered_by: user_id,
        timestamp: new Date(),
      },
      io,
      onlineUsers
    );

    return { success: true };
  } catch (error) {
    console.error("❌ Error handling call answered:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle call declined event
 * @param {Object} data - Call declined data
 * @param {string} data.call_id - Call ID
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID who declined
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onCallDeclined(data, io, onlineUsers) {
  try {
    const { call_id, conversation_id, user_id } = data;
    console.log(`📞 Call ${call_id} declined by ${user_id}`);

    // Emit to all participants
    await emitCallStatusToParticipants(
      conversation_id,
      {
        type: "call_declined",
        call_id,
        declined_by: user_id,
        timestamp: new Date(),
      },
      io,
      onlineUsers
    );

    return { success: true };
  } catch (error) {
    console.error("❌ Error handling call declined:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle call ended event
 * @param {Object} data - Call ended data
 * @param {string} data.call_id - Call ID
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID who ended
 * @param {number} data.duration - Call duration in seconds
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onCallEnded(data, io, onlineUsers) {
  try {
    const { call_id, conversation_id, user_id, duration } = data;
    console.log(
      `📞 Call ${call_id} ended by ${user_id}, duration: ${duration}s`
    );

    // Emit to all participants
    await emitCallStatusToParticipants(
      conversation_id,
      {
        type: "call_ended",
        call_id,
        ended_by: user_id,
        duration,
        timestamp: new Date(),
      },
      io,
      onlineUsers
    );

    return { success: true };
  } catch (error) {
    console.error("❌ Error handling call ended:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle group call notification
 * @param {Object} data - Group call notification data
 * @param {string} data.caller_id - ID of the caller
 * @param {string[]} data.participant_ids - Array of participant IDs
 * @param {string} data.type - Call type ('audio' or 'video')
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.call_id - Call ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGroupCallNotification(data, io, onlineUsers) {
  try {
    const { caller_id, participant_ids, type, conversation_id, call_id } = data;
    console.log(
      `📞 Group call notification: ${type} call by ${caller_id} with ${participant_ids.length} participants`
    );

    // Create notifications for all participants except caller
    const notifications = [];
    for (const participant_id of participant_ids) {
      if (participant_id !== caller_id) {
        const notification = await Notification.createNotification({
          recipientId: participant_id,
          senderId: caller_id,
          type: "call",
          title: `Incoming group ${type} call`,
          content: `You have an incoming group ${type} call`,
          data: {
            call_id: call_id || `group_call_${Date.now()}`,
            conversation_id,
            call_type: type,
            caller_id,
            is_group_call: true,
            participant_count: participant_ids.length,
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
        if (participant_id === caller_id) {
          // Emit to caller
          participantSocket.emit("groupCallStarted", {
            call_id: call_id || `group_call_${Date.now()}`,
            conversation_id,
            type,
            participant_ids,
            timestamp: new Date(),
          });
        } else {
          // Emit to participants
          const notification = notifications.find(
            (n) => n.recipient.toString() === participant_id
          );
          participantSocket.emit("incomingGroupCall", {
            notificationId: notification?._id,
            caller_id,
            type,
            conversation_id,
            call_id: call_id || `group_call_${Date.now()}`,
            participant_count: participant_ids.length,
            timestamp: new Date(),
          });

          // Mark as delivered
          if (notification) {
            await notification.markAsDelivered();
          }
        }
      }
    }

    return {
      success: true,
      call_id: call_id || `group_call_${Date.now()}`,
      notificationsCreated: notifications.length,
    };
  } catch (error) {
    console.error("❌ Error creating group call notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Emit call status to all participants in conversation
 */
async function emitCallStatusToParticipants(
  conversation_id,
  callData,
  io,
  onlineUsers
) {
  try {
    // This would typically get conversation participants from database
    // For now, we'll emit to all online users (you should implement proper participant lookup)
    onlineUsers.forEach((user) => {
      const userSocket = io.sockets.sockets.get(user.socketId);
      if (userSocket) {
        userSocket.emit("callStatusUpdate", {
          conversation_id,
          ...callData,
        });
      }
    });
  } catch (error) {
    console.error("Error emitting call status to participants:", error);
  }
}
