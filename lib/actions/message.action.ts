/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/message.action.ts - FIXED with populated read_by
import { CreateMessageDTO } from "@/dtos/message.dto";
import mongoose from "mongoose";
import { connectToDatabase } from "../mongoose";
import { auth } from "@clerk/nextjs/server";
import User from "@/database/user.model";
import Conversation from "@/database/conversation.model";
import Message from "@/database/message.model";
import { HuggingFaceService } from "../services/huggingface.service";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { emitSocketEvent } from "../socket.helper";
import { analyzeMessageEmotionsAsync } from "./emotion.action";
import { uploadEncryptedFileToCloudinary } from "./file.action";

// ============================================
// CREATE MESSAGE - OPTIMIZED VERSION
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
      replyTo 
    } = data;

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    // ✅ OPTIMIZED: Chỉ select fields cần thiết
    const conversation = await Conversation.findById(conversationId)
      .select('participants type')
      .lean();
    
    if (!conversation) throw new Error("Conversation not found");

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error("Not a participant");

    // ✨ E2EE Validation
    if (type === "text") {
      if (!encryptedContent || encryptedContent.trim().length === 0) {
        throw new Error("Text messages must have encrypted content for E2EE");
      }
    }

    if (type !== "text") {
      if (
        (!attachments || attachments.length === 0) &&
        (!encryptedContent || encryptedContent.trim().length === 0)
      ) {
        throw new Error("Non-text messages must have attachments or encrypted content");
      }
    }

    const allAttachmentIds = attachments?.map((id) => new mongoose.Types.ObjectId(id)) || [];

    // ✨ Create message
    const message = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: content?.trim(),
      encrypted_content: encryptedContent,
      encryption_metadata: encryptionMetadata,
      type: type || (allAttachmentIds.length > 0 ? 'file' : 'text'),
      attachments: allAttachmentIds,
      reply_to: replyTo ? new mongoose.Types.ObjectId(replyTo) : undefined,
    });

    // ==========================================
    // 🤖 AI EMOTION ANALYSIS (async, không block)
    // ==========================================
    if (type === "text" && content && content.trim().length > 0) {
      // ✅ OPTIMIZED: Chạy async, không await
      analyzeMessageEmotion(message._id, user._id, conversationId, content.trim())
        .catch(error => console.error("❌ Emotion analysis failed:", error));
    }

    // ✅ OPTIMIZED: Update conversation song song
    const updateConversationPromise = Conversation.findByIdAndUpdate(
      conversationId, 
      {
        last_message: message._id,
        last_activity: new Date(),
      },
      { new: false } // Không cần return document
    );

    // ✅ OPTIMIZED: Sử dụng aggregation thay vì populate
    const populateMessagePromise = Message.aggregate([
      {
        $match: { _id: message._id }
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

    // ✅ Chờ cả 2 operations song song
    const [, messages] = await Promise.all([
      updateConversationPromise,
      populateMessagePromise
    ]);

    const messageObj: any = messages[0];
    if (!messageObj) {
      throw new Error("Failed to retrieve created message");
    }

    // ✅ OPTIMIZED: Không cần transform vì aggregation đã format sẵn
    // Chỉ cần convert _id sang string
    messageObj._id = messageObj._id.toString();
    if (messageObj.attachments) {
      messageObj.attachments = messageObj.attachments.map((att: any) => ({
        ...att,
        _id: att._id.toString(),
      }));
    }
    if (messageObj.reply_to?.attachments) {
      messageObj.reply_to.attachments = messageObj.reply_to.attachments.map((att: any) => ({
        ...att,
        _id: att._id.toString(),
      }));
    }

    // ✨ Emit socket event
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
        message: {
          ...messageObj,
          content: undefined,
          encrypted_content: encryptedContent,
          encryption_metadata: encryptionMetadata,
        },
      },
      true
    );

    // ✅ Return full data
    return {
      success: true,
      data: {
        ...messageObj,
        content: content?.trim(),
        encrypted_content: encryptedContent,
        encryption_metadata: encryptionMetadata,
      },
    };
  } catch (error) {
    console.error("❌ Error creating message:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create message",
    };
  }
}

// ✅ Helper function cho emotion analysis (chạy async)
async function analyzeMessageEmotion(
  messageId: any,
  userId: any,
  conversationId: string,
  text: string
) {
  try {
    const emotionResult = await HuggingFaceService.analyzeEmotion(text);

    const emotionAnalysis = await EmotionAnalysis.create({
      user: userId,
      message: messageId,
      conversation: conversationId,
      context: "message",
      dominant_emotion: emotionResult.emotion,
      confidence_score: emotionResult.score,
      emotion_scores: emotionResult.allScores,
      text_analyzed: text,
      analyzed_at: new Date()
    });

    await emitSocketEvent(
      "emotionAnalyzed",
      conversationId,
      {
        message_id: messageId.toString(),
        emotion: emotionResult.emotion,
        score: emotionResult.score,
        analysis_id: emotionAnalysis._id.toString()
      },
      false
    );
  } catch (error) {
    throw error;
  }
}


// ============================================
// GET MESSAGES - OPTIMIZED & FIXED VERSION
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

    // ✅ OPTIMIZED: Giảm số lượng $lookup bằng cách group lại
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
            // Lookup sender for reply_to
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
            // Lookup attachments for reply_to
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
      
      // Stage 6: ✅ OPTIMIZED - Lookup read_by users and avatars together
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
      
      // Stage 7: ✅ OPTIMIZED - Process read_by in single $addFields
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
      
      // Stage 8: ✅ FIXED - Chỉ dùng exclusion (loại bỏ fields không cần)
      {
        $project: {
          senderData: 0,
          replyToData: 0,
          readByUsersData: 0,
        },
      },
    ]);

    // ✅ OPTIMIZED: Count query
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
// ADD REACTION
// ============================================
export async function addReaction(messageId: string, reactionType: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    await Message.findByIdAndUpdate(messageId, {
      $pull: { reactions: { user: user._id } },
    });

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

    const transformedReactions =
      updatedMessage?.reactions.map((r: any) => ({
        user: {
          _id: r.user._id,
          clerkId: r.user.clerkId,
          full_name: r.user.full_name,
          username: r.user.username,
          avatar: r.user.avatar?.url || r.user.avatar,
        },
        type: r.type,
        created_at: r.created_at,
      })) || [];

    await emitSocketEvent("newReaction", message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      reaction: reactionType,
      reactions: transformedReactions,
    });

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
// REMOVE REACTION
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

    const userReaction = message.reactions.find(
      (r: any) => r.user.toString() === user._id.toString()
    );

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $pull: { reactions: { user: user._id } } },
      { new: true }
    ).populate({
      path: "reactions.user",
      select: "clerkId full_name username avatar",
      populate: { path: "avatar", select: "url" },
    });

    const transformedReactions =
      updatedMessage?.reactions.map((r: any) => ({
        user: {
          _id: r.user._id,
          clerkId: r.user.clerkId,
          full_name: r.user.full_name,
          username: r.user.username,
          avatar: r.user.avatar?.url || r.user.avatar,
        },
        type: r.type,
        created_at: r.created_at,
      })) || [];

    await emitSocketEvent("deleteReaction", message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      reaction: userReaction?.type,
      reactions: transformedReactions,
    });

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
