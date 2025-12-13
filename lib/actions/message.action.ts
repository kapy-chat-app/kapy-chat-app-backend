/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/message.action.ts - FIXED with populated read_by
import { CreateMessageDTO, ReactionType } from "@/dtos/message.dto";
import mongoose from "mongoose";
import { connectToDatabase } from "../mongoose";
import { auth } from "@clerk/nextjs/server";
import User from "@/database/user.model";
import Conversation from "@/database/conversation.model";
import Message from "@/database/message.model";
import PushToken from "@/database/push-token.model";
import { sendPushNotification } from "../pushNotification";
import File from "@/database/file.model";
import { isUserActiveInConversation } from "../socket/activeUsers";
import { checkUserActiveInConversation } from "../socket.helper";
import { emitSocketEvent } from "../socket.helper";
// ============================================
// CREATE MESSAGE WITH RICH MEDIA - UPDATED
// ============================================
export async function createMessage(data: CreateMessageDTO) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const {
      conversationId,
      content,
      encryptedContent,
      encryptionMetadata,
      type,
      attachments,
      replyTo,
      richMedia,
    } = data;

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const conversation = await Conversation.findById(conversationId)
      .select("participants type")
      .lean();

    if (!conversation) throw new Error("Conversation not found");

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error("Not a participant");

    // Validation for text messages
    if (type === "text") {
      if (!encryptedContent || encryptedContent.trim().length === 0) {
        throw new Error("Text messages must have encrypted content for E2EE");
      }
    }

    // Validation for GIF/Sticker
    if (type === "gif" || type === "sticker") {
      if (!richMedia || !richMedia.provider || !richMedia.media_url) {
        throw new Error(`${type} messages must have valid rich media data`);
      }
    }

    // Validation for other media types
    if (
      type !== "text" &&
      type !== "gif" &&
      type !== "sticker" &&
      type !== "call_log"
    ) {
      if (
        (!attachments || attachments.length === 0) &&
        (!encryptedContent || encryptedContent.trim().length === 0)
      ) {
        throw new Error(
          "Non-text messages must have attachments or encrypted content"
        );
      }
    }

    const allAttachmentIds =
      attachments?.map((id) => new mongoose.Types.ObjectId(id)) || [];

    // Create message data
    const messageData: any = {
      conversation: conversationId,
      sender: user._id,
      content: content?.trim(),
      encrypted_content: encryptedContent,
      encryption_metadata: encryptionMetadata,
      type: type || (allAttachmentIds.length > 0 ? "file" : "text"),
      attachments: allAttachmentIds,
      reply_to: replyTo ? new mongoose.Types.ObjectId(replyTo) : undefined,
    };

    // Add rich_media if present
    if (richMedia && (type === "gif" || type === "sticker")) {
      messageData.rich_media = richMedia;
    }

    const message = await Message.create(messageData);

    // ==========================================
    // ❌ REMOVED: AI EMOTION ANALYSIS
    // ==========================================
    // Emotion analysis sẽ được xử lý ở client-side

    // Update conversation
    const updateConversationPromise = Conversation.findByIdAndUpdate(
      conversationId,
      {
        last_message: message._id,
        last_activity: new Date(),
      },
      { new: false }
    );

    // Populate message with aggregation
    const populateMessagePromise = Message.aggregate([
      {
        $match: { _id: message._id },
      },
      // Lookup sender với avatar
      {
        $lookup: {
          from: "users",
          let: { senderId: "$sender" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$senderId"] } } },
            {
              $lookup: {
                from: "files",
                localField: "avatar",
                foreignField: "_id",
                as: "avatarData",
              },
            },
            {
              $project: {
                clerkId: 1,
                full_name: 1,
                username: 1,
                avatar: { $arrayElemAt: ["$avatarData.url", 0] },
              },
            },
          ],
          as: "senderData",
        },
      },
      // Lookup attachments
      {
        $lookup: {
          from: "files",
          localField: "attachments",
          foreignField: "_id",
          as: "attachments",
          pipeline: [
            {
              $project: {
                _id: 1,
                file_name: 1,
                file_type: 1,
                file_size: 1,
                url: 1,
                cloudinary_public_id: 1,
                is_encrypted: 1,
                encryption_metadata: 1,
              },
            },
          ],
        },
      },
      // Lookup reply_to
      {
        $lookup: {
          from: "messages",
          let: { replyToId: "$reply_to" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$replyToId"] } } },
            {
              $lookup: {
                from: "users",
                let: { senderId: "$sender" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$senderId"] } } },
                  {
                    $lookup: {
                      from: "files",
                      localField: "avatar",
                      foreignField: "_id",
                      as: "avatarData",
                    },
                  },
                  {
                    $project: {
                      clerkId: 1,
                      full_name: 1,
                      username: 1,
                      avatar: { $arrayElemAt: ["$avatarData.url", 0] },
                    },
                  },
                ],
                as: "senderData",
              },
            },
            {
              $lookup: {
                from: "files",
                localField: "attachments",
                foreignField: "_id",
                as: "attachments",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      file_name: 1,
                      file_type: 1,
                      file_size: 1,
                      url: 1,
                      cloudinary_public_id: 1,
                      is_encrypted: 1,
                      encryption_metadata: 1,
                    },
                  },
                ],
              },
            },
            {
              $project: {
                content: 1,
                encrypted_content: 1,
                encryption_metadata: 1,
                type: 1,
                created_at: 1,
                rich_media: 1,
                sender: { $arrayElemAt: ["$senderData", 0] },
                attachments: 1,
              },
            },
          ],
          as: "replyToData",
        },
      },
      // Lookup read_by users
      {
        $lookup: {
          from: "users",
          let: { readByUsers: "$read_by.user" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$readByUsers"] } } },
            {
              $lookup: {
                from: "files",
                localField: "avatar",
                foreignField: "_id",
                as: "avatarData",
              },
            },
            {
              $project: {
                _id: 1,
                clerkId: 1,
                full_name: 1,
                username: 1,
                avatar: { $arrayElemAt: ["$avatarData.url", 0] },
              },
            },
          ],
          as: "readByUsersData",
        },
      },
      // Format output
      {
        $project: {
          _id: 1,
          conversation: 1,
          content: 1,
          encrypted_content: 1,
          encryption_metadata: 1,
          type: 1,
          reactions: 1,
          is_edited: 1,
          edited_at: 1,
          deleted_by: 1,
          metadata: 1,
          rich_media: 1,
          created_at: 1,
          updated_at: 1,
          sender: { $arrayElemAt: ["$senderData", 0] },
          attachments: 1,
          reply_to: { $arrayElemAt: ["$replyToData", 0] },
          read_by: {
            $map: {
              input: "$read_by",
              as: "rb",
              in: {
                user: "$$rb.user",
                read_at: "$$rb.read_at",
                userInfo: {
                  $let: {
                    vars: {
                      matchedUser: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$readByUsersData",
                              as: "u",
                              cond: { $eq: ["$$u._id", "$$rb.user"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      clerkId: "$$matchedUser.clerkId",
                      full_name: "$$matchedUser.full_name",
                      username: "$$matchedUser.username",
                      avatar: "$$matchedUser.avatar",
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]);

    // Chờ cả 2 operations song song
    const [, messages] = await Promise.all([
      updateConversationPromise,
      populateMessagePromise,
    ]);

    const messageObj: any = messages[0];
    if (!messageObj) {
      throw new Error("Failed to retrieve created message");
    }

    // Convert IDs to strings
    messageObj._id = messageObj._id.toString();
    if (messageObj.attachments) {
      messageObj.attachments = messageObj.attachments.map((att: any) => ({
        ...att,
        _id: att._id.toString(),
      }));
    }
    if (messageObj.reply_to?.attachments) {
      messageObj.reply_to.attachments = messageObj.reply_to.attachments.map(
        (att: any) => ({
          ...att,
          _id: att._id.toString(),
        })
      );
    }

    // Emit socket event
    await emitSocketEvent(
      "newMessage",
      conversationId,
      {
        message_id: messageObj._id,
        conversation_id: conversationId,
        sender_id: user.clerkId,
        sender_name: user.full_name,
        sender_username: user.username,
        sender_avatar: messageObj.sender?.avatar,
        message_content: undefined,
        encrypted_content: encryptedContent,
        encryption_metadata: encryptionMetadata,
        message_type: type,
        rich_media: richMedia,
        message: {
          ...messageObj,
          content: undefined,
          encrypted_content: encryptedContent,
          encryption_metadata: encryptionMetadata,
          rich_media: richMedia,
        },
      },
      true
    );

    //Gửi push notification
    try {
      const conversation = await Conversation.findById(conversationId)
        .populate("participants", "_id clerkId")
        .lean();

      if (conversation) {
        const recipients = conversation.participants.filter(
          (p: any) => p.clerkId !== userId
        );

        for (const recipient of recipients) {
          console.log(
            `\n📊 [NOTIFICATION] Processing recipient: ${recipient.clerkId}`
          );

          // ✅ CHECK: User có đang active trong conversation này không?
          const isActive = await checkUserActiveInConversation(
            recipient.clerkId,
            conversationId
          );

          console.log(`📊 [NOTIFICATION] Is Active: ${isActive}`);

          if (isActive) {
            console.log(
              `⏭️ [NOTIFICATION] SKIPPING - User is active in conversation`
            );
            continue; // ✅ Skip push notification
          }

          // ✅ LẤY PUSH TOKEN
          const pushTokenDoc = await PushToken.findOne({
            user: recipient._id,
            is_active: true,
          }).sort({ last_used: -1 });

          if (!pushTokenDoc?.token) {
            console.log(`⏭️ [NOTIFICATION] SKIPPING - No push token found`);
            continue;
          }

          // Tạo message preview
          let messagePreview = "";
          const notificationData: any = {
            type: "message",
            conversationId: conversationId,
            messageId: messageObj._id,
            senderId: userId,
            senderName: user.full_name,
            senderAvatar: messageObj.sender?.avatar,
            messageType: type,
            conversationType: conversation.type,
            hasAttachments: allAttachmentIds.length > 0,
          };

          if (type === "text") {
            messagePreview = "💬 Sent you a message";
            notificationData.encryptedContent = encryptedContent;
            notificationData.encryptionMetadata = encryptionMetadata;
          } else if (type === "image") {
            messagePreview = "📷 Sent a photo";
            if (allAttachmentIds.length > 1) {
              messagePreview = `📷 Sent ${allAttachmentIds.length} photos`;
            }
          } else if (type === "video") {
            messagePreview = "🎥 Sent a video";
          } else if (type === "gif") {
            messagePreview = "🎬 Sent a GIF";
          } else if (type === "sticker") {
            messagePreview = "😊 Sent a sticker";
          } else if (type === "file") {
            messagePreview = "📄 Sent a file";
          }

          // ✅ GỬI PUSH NOTIFICATION (chỉ khi user không active)
          await sendPushNotification({
            pushToken: pushTokenDoc.token,
            title:
              conversation.type === "group"
                ? `${conversation.name || "Group Chat"}`
                : user.full_name,
            body: messagePreview,
            data: notificationData,
            channelId: "messages",
            priority: "high",
          });

          console.log(
            `✅ [NOTIFICATION] Push sent to ${recipient.clerkId} (not active)`
          );
        }
      }
    } catch (notifError) {
      console.error("⚠️ Failed to send push notification:", notifError);
    }

    return {
      success: true,
      data: {
        ...messageObj,
        content: content?.trim(),
        encrypted_content: encryptedContent,
        encryption_metadata: encryptionMetadata,
        rich_media: richMedia,
      },
    };
  } catch (error) {
    console.error("❌ Error creating message:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create message",
    };
  }
}
// ============================================
// GET MESSAGES - FIXED: Include metadata field
// ============================================
export async function getMessages(
  conversationId: string,
  page: number = 1,
  limit: number = 50
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant)
      throw new Error("Not a participant in this conversation");

    const skip = (page - 1) * limit;

    const messages = await Message.aggregate([
      // Stage 1: Match messages
      {
        $match: {
          conversation: new mongoose.Types.ObjectId(conversationId),
          $nor: [
            {
              deleted_by: {
                $elemMatch: {
                  user: user._id,
                  delete_type: "only_me",
                },
              },
            },
            {
              deleted_by: {
                $elemMatch: {
                  delete_type: "both",
                },
              },
            },
          ],
        },
      },
      // Stage 2: Sort and paginate
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: limit },
      // Stage 3: Lookup sender with avatar in one go
      {
        $lookup: {
          from: "users",
          let: { senderId: "$sender" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$senderId"] } } },
            {
              $lookup: {
                from: "files",
                localField: "avatar",
                foreignField: "_id",
                as: "avatarData",
              },
            },
            {
              $project: {
                clerkId: 1,
                full_name: 1,
                username: 1,
                avatar: { $arrayElemAt: ["$avatarData.url", 0] },
              },
            },
          ],
          as: "senderData",
        },
      },
      {
        $addFields: {
          sender: { $arrayElemAt: ["$senderData", 0] },
        },
      },
      // Stage 4: Lookup attachments (metadata only)
      {
        $lookup: {
          from: "files",
          localField: "attachments",
          foreignField: "_id",
          as: "attachments",
          pipeline: [
            {
              $project: {
                _id: 1,
                file_name: 1,
                file_type: 1,
                file_size: 1,
                url: 1,
                cloudinary_public_id: 1,
                is_encrypted: 1,
                encryption_metadata: 1,
                created_at: 1,
              },
            },
          ],
        },
      },
      // Stage 5: Lookup reply_to message
      {
        $lookup: {
          from: "messages",
          let: { replyToId: "$reply_to" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$replyToId"] } } },
            {
              $lookup: {
                from: "users",
                let: { senderId: "$sender" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$senderId"] } } },
                  {
                    $lookup: {
                      from: "files",
                      localField: "avatar",
                      foreignField: "_id",
                      as: "avatarData",
                    },
                  },
                  {
                    $project: {
                      clerkId: 1,
                      full_name: 1,
                      username: 1,
                      avatar: { $arrayElemAt: ["$avatarData.url", 0] },
                    },
                  },
                ],
                as: "senderData",
              },
            },
            {
              $lookup: {
                from: "files",
                localField: "attachments",
                foreignField: "_id",
                as: "attachments",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      file_name: 1,
                      file_type: 1,
                      file_size: 1,
                      url: 1,
                      cloudinary_public_id: 1,
                      is_encrypted: 1,
                      encryption_metadata: 1,
                    },
                  },
                ],
              },
            },
            {
              $project: {
                content: 1,
                encrypted_content: 1,
                encryption_metadata: 1,
                type: 1,
                created_at: 1,
                rich_media: 1,
                metadata: 1, // ✨ INCLUDE metadata for reply_to
                sender: { $arrayElemAt: ["$senderData", 0] },
                attachments: 1,
              },
            },
          ],
          as: "replyToData",
        },
      },
      {
        $addFields: {
          reply_to: { $arrayElemAt: ["$replyToData", 0] },
        },
      },
      // Stage 6: Lookup read_by users and avatars together
      {
        $lookup: {
          from: "users",
          let: { readByUsers: "$read_by.user" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$readByUsers"] } } },
            {
              $lookup: {
                from: "files",
                localField: "avatar",
                foreignField: "_id",
                as: "avatarData",
              },
            },
            {
              $project: {
                _id: 1,
                clerkId: 1,
                full_name: 1,
                username: 1,
                avatar: { $arrayElemAt: ["$avatarData.url", 0] },
              },
            },
          ],
          as: "readByUsersData",
        },
      },
      // Stage 7: Process read_by in single $addFields
      {
        $addFields: {
          read_by: {
            $map: {
              input: "$read_by",
              as: "rb",
              in: {
                user: "$$rb.user",
                read_at: "$$rb.read_at",
                userInfo: {
                  $let: {
                    vars: {
                      matchedUser: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$readByUsersData",
                              as: "u",
                              cond: { $eq: ["$$u._id", "$$rb.user"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      clerkId: "$$matchedUser.clerkId",
                      full_name: "$$matchedUser.full_name",
                      username: "$$matchedUser.username",
                      avatar: "$$matchedUser.avatar",
                    },
                  },
                },
              },
            },
          },
        },
      },
      // Stage 8: ✨ CRITICAL FIX - Keep all fields including metadata
      {
        $project: {
          // Remove only temporary fields
          senderData: 0,
          replyToData: 0,
          readByUsersData: 0,
          // ✨ DO NOT remove any other fields - they'll be included by default
          // This means metadata, rich_media, etc. will all be included
        },
      },
    ]);
    const total = await Message.countDocuments({
      conversation: conversationId,
      $nor: [
        {
          deleted_by: {
            $elemMatch: {
              user: user._id,
              delete_type: "only_me",
            },
          },
        },
        {
          deleted_by: {
            $elemMatch: {
              delete_type: "both",
            },
          },
        },
      ],
    });

    return {
      success: true,
      data: {
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    };
  } catch (error) {
    console.error("Error getting messages:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get messages",
    };
  }
}
// ============================================
// GET POPULAR RICH MEDIA IN CONVERSATION - NEW
// ============================================
export async function getPopularRichMedia(
  conversationId: string,
  type: "gif" | "sticker",
  provider?: string,
  limit: number = 10
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error("Not a participant");

    const popularMedia = await Message.getPopularRichMedia(
      conversationId,
      type,
      provider,
      limit
    );

    return {
      success: true,
      data: popularMedia,
    };
  } catch (error) {
    console.error("Error getting popular rich media:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get popular rich media",
    };
  }
}

// ============================================
// GET RICH MEDIA STATS - NEW
// ============================================
export async function getRichMediaStats(
  conversationId?: string,
  type?: "gif" | "sticker"
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) throw new Error("Conversation not found");

      const isParticipant = conversation.participants.some(
        (p: any) => p.toString() === user._id.toString()
      );
      if (!isParticipant) throw new Error("Not a participant");
    }

    const stats = await Message.getRichMediaStats(conversationId, type);

    return {
      success: true,
      data: stats,
    };
  } catch (error) {
    console.error("Error getting rich media stats:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get rich media stats",
    };
  }
}

// ============================================
// UPDATE MESSAGE
// ============================================
export async function updateMessage(messageId: string, content: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    if (message.sender.toString() !== user._id.toString()) {
      throw new Error("Only sender can edit message");
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        content: content.trim(),
        is_edited: true,
        edited_at: new Date(),
      },
      { new: true }
    )
      .populate({
        path: "sender",
        select: "clerkId full_name username avatar",
        populate: { path: "avatar", select: "url" },
      })
      .populate("attachments", "file_name file_type file_size url")
      .populate({
        path: "read_by.user",
        select: "clerkId full_name username avatar",
        populate: { path: "avatar", select: "url" },
      });

    await emitSocketEvent("updateMessage", message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      new_content: content.trim(),
      edited_by: userId,
      edited_at: new Date(),
    });

    return {
      success: true,
      data: updatedMessage,
    };
  } catch (error) {
    console.error("Error updating message:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update message",
    };
  }
}

// ============================================
// DELETE MESSAGE
// ============================================
export async function deleteMessage(
  messageId: string,
  deleteType: "only_me" | "both" = "only_me"
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    if (
      deleteType === "both" &&
      message.sender.toString() !== user._id.toString()
    ) {
      throw new Error("Only sender can recall message");
    }

    await Message.findByIdAndUpdate(messageId, {
      $addToSet: {
        deleted_by: {
          user: user._id,
          deleted_at: new Date(),
          delete_type: deleteType,
        },
      },
    });

    await emitSocketEvent("deleteMessage", message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      delete_type: deleteType,
    });

    return {
      success: true,
      data: { messageId, deleteType },
    };
  } catch (error) {
    console.error("Error deleting message:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete message",
    };
  }
}

// ============================================
// ADD REACTION - OPTIMIZED
// ============================================
export async function addReaction(
  messageId: string,
  reactionType: ReactionType
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    // Verify user is participant in conversation
    const conversation = await Conversation.findById(message.conversation)
      .select("participants")
      .lean();

    if (!conversation) throw new Error("Conversation not found");

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error("Not a participant");

    // Validate reaction type
    const validReactions: ReactionType[] = [
      "heart",
      "like",
      "sad",
      "angry",
      "laugh",
      "wow",
      "dislike",
    ];
    if (!validReactions.includes(reactionType)) {
      throw new Error("Invalid reaction type");
    }

    // Remove existing reaction from this user first
    await Message.findByIdAndUpdate(messageId, {
      $pull: { reactions: { user: user._id } },
    });

    // Add new reaction
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        $addToSet: {
          reactions: {
            user: user._id,
            type: reactionType,
            created_at: new Date(),
          },
        },
      },
      { new: true }
    ).populate({
      path: "reactions.user",
      select: "clerkId full_name username avatar",
      populate: { path: "avatar", select: "url" },
    });

    if (!updatedMessage) {
      throw new Error("Failed to update message");
    }

    // Transform reactions
    const transformedReactions = updatedMessage.reactions.map((r: any) => ({
      user: {
        _id: r.user._id.toString(),
        clerkId: r.user.clerkId,
        full_name: r.user.full_name,
        username: r.user.username,
        avatar: r.user.avatar?.url || r.user.avatar,
      },
      type: r.type,
      created_at: r.created_at,
    }));

    // Emit socket event
    await emitSocketEvent(
      "newReaction",
      message.conversation.toString(),
      {
        message_id: messageId,
        user_id: user.clerkId,
        user_name: user.full_name,
        user_avatar: user.avatar,
        reaction: reactionType,
        reactions: transformedReactions,
      },
      false
    );

    return {
      success: true,
      data: {
        messageId,
        reactions: transformedReactions,
      },
    };
  } catch (error) {
    console.error("Error adding reaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add reaction",
    };
  }
}

// ============================================
// REMOVE REACTION - OPTIMIZED
// ============================================
export async function removeReaction(messageId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    // Verify user is participant in conversation
    const conversation = await Conversation.findById(message.conversation)
      .select("participants")
      .lean();

    if (!conversation) throw new Error("Conversation not found");

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error("Not a participant");

    // Find user's reaction before removing
    const userReaction = message.reactions.find(
      (r: any) => r.user.toString() === user._id.toString()
    );

    // Remove reaction
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $pull: { reactions: { user: user._id } } },
      { new: true }
    ).populate({
      path: "reactions.user",
      select: "clerkId full_name username avatar",
      populate: { path: "avatar", select: "url" },
    });

    if (!updatedMessage) {
      throw new Error("Failed to update message");
    }

    // Transform reactions
    const transformedReactions = updatedMessage.reactions.map((r: any) => ({
      user: {
        _id: r.user._id.toString(),
        clerkId: r.user.clerkId,
        full_name: r.user.full_name,
        username: r.user.username,
        avatar: r.user.avatar?.url || r.user.avatar,
      },
      type: r.type,
      created_at: r.created_at,
    }));

    // Emit socket event
    await emitSocketEvent(
      "deleteReaction",
      message.conversation.toString(),
      {
        message_id: messageId,
        user_id: user.clerkId,
        user_name: user.full_name,
        reaction: userReaction?.type,
        reactions: transformedReactions,
      },
      false
    );

    return {
      success: true,
      data: {
        messageId,
        reactions: transformedReactions,
      },
    };
  } catch (error) {
    console.error("Error removing reaction:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to remove reaction",
    };
  }
}

// ============================================
// GET REACTION COUNTS - NEW
// ============================================
export async function getReactionCounts(messageId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    const counts: Record<string, number> = {};
    message.reactions.forEach((reaction: any) => {
      counts[reaction.type] = (counts[reaction.type] || 0) + 1;
    });

    return {
      success: true,
      data: counts,
    };
  } catch (error) {
    console.error("Error getting reaction counts:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get reaction counts",
    };
  }
}

// ============================================
// GET USERS WHO REACTED - NEW
// ============================================
export async function getUsersWhoReacted(
  messageId: string,
  reactionType?: ReactionType
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const message = await Message.findById(messageId).populate({
      path: "reactions.user",
      select: "clerkId full_name username avatar",
      populate: { path: "avatar", select: "url" },
    });

    if (!message) throw new Error("Message not found");

    let reactions = message.reactions;

    // Filter by reaction type if provided
    if (reactionType) {
      reactions = reactions.filter((r: any) => r.type === reactionType);
    }

    // Transform reactions
    const transformedReactions = reactions.map((r: any) => ({
      user: {
        _id: r.user._id.toString(),
        clerkId: r.user.clerkId,
        full_name: r.user.full_name,
        username: r.user.username,
        avatar: r.user.avatar?.url || r.user.avatar,
      },
      type: r.type,
      created_at: r.created_at,
    }));

    return {
      success: true,
      data: transformedReactions,
    };
  } catch (error) {
    console.error("Error getting users who reacted:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get users who reacted",
    };
  }
}

// ============================================
// TOGGLE REACTION - NEW (Convenience method)
// ============================================
export async function toggleReaction(
  messageId: string,
  reactionType: ReactionType
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    // Check if user already reacted with this type
    const existingReaction = message.reactions.find(
      (r: any) =>
        r.user.toString() === user._id.toString() && r.type === reactionType
    );

    if (existingReaction) {
      // Remove reaction if it exists
      return await removeReaction(messageId);
    } else {
      // Add reaction if it doesn't exist
      return await addReaction(messageId, reactionType);
    }
  } catch (error) {
    console.error("Error toggling reaction:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to toggle reaction",
    };
  }
}

// ============================================
// MARK AS READ - SINGLE MESSAGE
// ============================================
export async function markAsRead(messageId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    if (message.sender.toString() === user._id.toString()) {
      console.log(`⏭️ Skipping mark as read: User is the sender`);
      return {
        success: true,
        data: { messageId, alreadyRead: true, skipped: true },
      };
    }

    const alreadyRead = message.read_by.some(
      (r: any) => r.user?.toString() === user._id.toString()
    );

    if (!alreadyRead) {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: {
          read_by: {
            user: user._id,
            read_at: new Date(),
          },
        },
      });

      console.log(`✅ Message ${messageId} marked as read by ${userId}`);

      // ✅ Populate user info for socket event
      const userInfo = {
        clerkId: user.clerkId,
        full_name: user.full_name,
        username: user.username,
        avatar: user.avatar,
      };

      try {
        const socketUrl = `${
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
        }/api/socket/emit`;

        await fetch(socketUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "messageRead",
            conversationId: message.conversation.toString(),
            emitToParticipants: true,
            data: {
              message_id: messageId,
              conversation_id: message.conversation.toString(),
              user_id: userId,
              user_info: userInfo,
              read_at: new Date().toISOString(),
            },
          }),
        });

        console.log(`✅ Emitted messageRead event for message ${messageId}`);
      } catch (socketError) {
        console.error("⚠️ Failed to emit socket event:", socketError);
      }
    } else {
      console.log(
        `⏭️ Message ${messageId} already marked as read by ${userId}`
      );
    }

    return {
      success: true,
      data: { messageId, alreadyRead },
    };
  } catch (error) {
    console.error("❌ Error marking message as read:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to mark message as read",
    };
  }
}
