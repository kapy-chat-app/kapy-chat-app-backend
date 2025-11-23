/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/conversation.action.ts

import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "../mongoose";
import { CreateConversationDTO, UpdateConversationDTO } from "@/dtos/conversation.dto";
import User from "@/database/user.model";
import Conversation from "@/database/conversation.model";
import Message from "@/database/message.model";
import { deleteFileFromCloudinary, uploadFileToCloudinary } from "./file.action";
import File from "@/database/file.model";
import { emitToUserRoom } from "../socket.helper";

// ============================================
// HELPER: Emit Socket Events
// ============================================

// Emit đến conversation room và personal rooms
async function emitSocketEvent(
  event: string, 
  conversationId: string, 
  data: any,
  emitToParticipants: boolean = true
) {
  try {
    const socketUrl = process.env.SOCKET_URL || 'http://localhost:3000/api/socket/emit';
    
    await fetch(socketUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        conversationId,
        emitToParticipants,
        data: {
          ...data,
          timestamp: new Date(),
        }
      })
    });
    
    console.log(`✅ Socket event '${event}' emitted (emitToParticipants: ${emitToParticipants})`);
  } catch (socketError) {
    console.error(`⚠️ Socket emit failed for '${event}':`, socketError);
  }
}

// ============================================
// HELPER: Format System Message for Display
// ============================================
/**
 * Format system message content based on action type
 * Returns human-readable message with proper formatting
 */
export function formatSystemMessage(message: any): string {
  const metadata = message.metadata;
  
  if (!metadata || !metadata.isSystemMessage) {
    return message.content;
  }

  const action = metadata.action;
  
  switch (action) {
    case 'add_participants':
      const addedNames = metadata.addedUsers?.map((u: any) => u.full_name).join(', ');
      return `${message.sender?.full_name || 'Someone'} đã thêm ${addedNames} vào nhóm`;
    
    case 'remove_participant':
      if (metadata.isKicked) {
        return `${message.sender?.full_name || 'Someone'} đã xóa ${metadata.removedUser?.full_name} khỏi nhóm`;
      }
      return `${metadata.removedUser?.full_name} đã rời khỏi nhóm`;
    
    case 'leave_group':
      return `${metadata.removedUser?.full_name || message.sender?.full_name} đã rời khỏi nhóm`;
    
    case 'transfer_admin':
      return `${metadata.fromUserName} đã chuyển quyền quản trị viên cho ${metadata.toUserName}`;
    
    case 'update_group_avatar':
      return `${metadata.updatedByName || message.sender?.full_name} đã thay đổi ảnh đại diện nhóm`;
    
    case 'dissolve_group':
      return `${metadata.dissolvedByName || message.sender?.full_name} đã giải tán nhóm`;
    
    case 'create_group':
      return `${message.sender?.full_name} đã tạo nhóm`;
    
    default:
      return message.content || 'Hoạt động nhóm';
  }
}

/**
 * Get icon for system message action
 */
export function getSystemMessageIcon(action: string): string {
  const icons: Record<string, string> = {
    'add_participants': '👥',
    'remove_participant': '👋',
    'leave_group': '🚪',
    'transfer_admin': '👑',
    'update_group_avatar': '🖼️',
    'dissolve_group': '⚠️',
    'create_group': '✨',
  };
  
  return icons[action] || '📌';
}
async function emitSystemMessageAsNewMessage(conversationId: string, messageId: string) {
  try {
    const socketUrl = process.env.SOCKET_URL || 'http://localhost:3000/api/socket/emit';
    
    // Populate message with sender info
    const message = await Message.findById(messageId)
      .populate('sender', 'clerkId full_name username avatar')
      .populate({
        path: 'sender',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      });

    if (!message) {
      console.error('❌ Message not found:', messageId);
      return;
    }

    // Format message for frontend
    const formattedMessage = {
      ...message.toObject(),
      sender: {
        _id: message.sender._id,
        clerkId: message.sender.clerkId,
        full_name: message.sender.full_name,
        username: message.sender.username,
        avatar: message.sender.avatar?.url || null,
      }
    };

    // Emit as 'newMessage' event
    await fetch(socketUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'newMessage', // ⭐ Sử dụng event 'newMessage'
        conversationId,
        emitToParticipants: true,
        data: {
          conversation_id: conversationId,
          message: formattedMessage,
          sender_id: message.sender.clerkId,
          timestamp: new Date(),
        }
      })
    });
    
    console.log(`✅ System message emitted as newMessage:`, {
      id: messageId,
      action: message.metadata?.action,
    });
  } catch (error) {
    console.error(`⚠️ Failed to emit system message:`, error);
  }
}
export async function createConversation(data: CreateConversationDTO) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const { type, participantIds, name, description } = data;

    if (participantIds.length < 1) {
      throw new Error('At least one participant is required');
    }

    if (type === 'private' && participantIds.length !== 2) {
      throw new Error('Private conversations must have exactly 2 participants');
    }

    const users = await User.find({ clerkId: { $in: participantIds } });
    if (users.length !== participantIds.length) {
      throw new Error('Some users not found');
    }

    const userObjectIds = users.map(user => user._id);

    if (type === 'private') {
      const existingConversation = await Conversation.findOne({
        type: 'private',
        participants: { $all: userObjectIds, $size: 2 }
      });
      
      if (existingConversation) {
        return {
          success: true,
          data: await populateConversation(existingConversation)
        };
      }
    }

    const conversation = await Conversation.create({
      type,
      participants: userObjectIds,
      name: type === 'group' ? name : undefined,
      description: type === 'group' ? description : undefined,
      created_by: users.find(u => u.clerkId === userId)?._id,
      admin: type === 'group' ? users.find(u => u.clerkId === userId)?._id : undefined
    });

    const populatedConversation = await populateConversation(conversation);

    // ✅ Create system message for group creation
    if (type === 'group') {
      const creatorUser = users.find(u => u.clerkId === userId);
      await Message.create({
        conversation: conversation._id,
        sender: creatorUser!._id,
        content: `${creatorUser!.full_name} đã tạo nhóm`,
        type: 'text',
        metadata: {
          isSystemMessage: true,
          action: 'create_group',
          createdBy: userId,
          groupName: name
        }
      });
    }

    // ✅ Emit to OTHER participants (exclude creator)
    try {
      const otherParticipants = participantIds.filter(id => id !== userId);
      
      if (otherParticipants.length > 0) {
        const emitPromises = otherParticipants.map(participantId => 
          emitToUserRoom(
            'newConversation',
            participantId,
            {
              conversation_id: populatedConversation._id,
              type: populatedConversation.type,
              name: populatedConversation.name,
              description: populatedConversation.description,
              avatar: populatedConversation.avatar,
              participants: populatedConversation.participants,
              created_by: userId,
              created_at: populatedConversation.created_at,
              last_activity: populatedConversation.last_activity,
              is_archived: false,
              is_pinned: false,
              unreadCount: 0,
            }
          )
        );

        await Promise.all(emitPromises);
        console.log(`✅ Emitted newConversation to ${otherParticipants.length} OTHER participants`);
      }
    } catch (socketError) {
      console.error('⚠️ Failed to emit socket events:', socketError);
    }

    return {
      success: true,
      data: populatedConversation
    };
  } catch (error) {
    console.error('Error creating conversation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create conversation'
    };
  }
}

export async function getConversations(page: number = 1, limit: number = 20) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const skip = (page - 1) * limit;

    const conversations = await Conversation.aggregate([
      // Stage 1: Lọc conversations của user
      {
        $match: {
          participants: user._id,
          is_archived: false
        }
      },
      
      // Stage 2: Sắp xếp
      {
        $sort: { is_pinned: -1, last_activity: -1 }
      },
      
      // Stage 3: Phân trang
      {
        $skip: skip
      },
      {
        $limit: limit
      },
      
      // Stage 4: Tính số tin nhắn chưa đọc
      {
        $lookup: {
          from: 'messages',
          let: { convId: '$_id', userId: user._id },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$conversation', '$$convId'] },
                    { $ne: ['$sender', '$$userId'] },
                    {
                      $not: {
                        $in: ['$$userId', { $ifNull: ['$read_by.user', []] }]
                      }
                    }
                  ]
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'unreadMessages'
        }
      },
      
      // Stage 5: Thêm field unreadCount
      {
        $addFields: {
          unreadCount: {
            $ifNull: [{ $arrayElemAt: ['$unreadMessages.count', 0] }, 0]
          }
        }
      },
      
      // Stage 6: Populate participants
      {
        $lookup: {
          from: 'users',
          localField: 'participants',
          foreignField: '_id',
          as: 'participants'
        }
      },
      
      // Stage 7: Populate avatar của participants
      {
        $lookup: {
          from: 'files',
          localField: 'participants.avatar',
          foreignField: '_id',
          as: 'participantAvatars'
        }
      },
      
      // Stage 8: Populate last_message với TẤT CẢ fields
      {
        $lookup: {
          from: 'messages',
          let: { lastMsgId: '$last_message' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$lastMsgId'] }
              }
            },
            {
              $project: {
                _id: 1,
                content: 1,
                encrypted_content: 1,
                message_type: 1,
                type: 1,
                sender: 1,
                attachments: 1,
                createdAt: 1,
                updatedAt: 1,
                is_edited: 1
              }
            }
          ],
          as: 'last_message'
        }
      },
      {
        $unwind: {
          path: '$last_message',
          preserveNullAndEmptyArrays: true
        }
      },
      
      // Stage 9: Populate sender của last_message
      {
        $lookup: {
          from: 'users',
          localField: 'last_message.sender',
          foreignField: '_id',
          as: 'lastMessageSender'
        }
      },
      {
        $unwind: {
          path: '$lastMessageSender',
          preserveNullAndEmptyArrays: true
        }
      },
      
      // Stage 10: Populate avatar của sender
      {
        $lookup: {
          from: 'files',
          localField: 'lastMessageSender.avatar',
          foreignField: '_id',
          as: 'lastMessageSenderAvatar'
        }
      },
      
      // Stage 11: Populate attachments của last_message
      {
        $lookup: {
          from: 'files',
          localField: 'last_message.attachments',
          foreignField: '_id',
          as: 'lastMessageAttachments'
        }
      },
      
      // Stage 12: Populate conversation avatar
      {
        $lookup: {
          from: 'files',
          localField: 'avatar',
          foreignField: '_id',
          as: 'conversationAvatar'
        }
      },
      
      // Stage 13: Clean up temporary fields
      {
        $project: {
          unreadMessages: 0
        }
      }
    ]);

    const total = await Conversation.countDocuments({
      participants: user._id,
      is_archived: false
    });

    // Process data after aggregation
    const conversationsWithUnread = conversations.map((conv: any) => {
      const participantAvatarMap = new Map(
        (conv.participantAvatars || []).map((avatar: any) => [
          avatar._id.toString(),
          avatar.url
        ])
      );

      const participantsWithAvatar = (conv.participants || []).map((p: any) => {
        const avatarId = p.avatar ? p.avatar.toString() : null;
        const avatarUrl = avatarId ? participantAvatarMap.get(avatarId) : null;
        
        return {
          _id: p._id,
          clerkId: p.clerkId,
          full_name: p.full_name,
          username: p.username,
          is_online: p.is_online,
          last_seen: p.last_seen,
          avatar: avatarUrl || null
        };
      });

      const convAvatarData: any = conv.conversationAvatar?.[0];
      let conversationAvatar = convAvatarData ? (convAvatarData.url || null) : null;
      
      if (conv.type === 'private' && !conversationAvatar) {
        const otherParticipant = participantsWithAvatar?.find(
          (p: any) => p.clerkId !== userId
        );
        conversationAvatar = otherParticipant?.avatar || null;
      }

      let lastMessage = null;
      if (conv.last_message && conv.lastMessageSender) {
        const senderAvatarData: any = conv.lastMessageSenderAvatar?.[0];
        
        lastMessage = {
          _id: conv.last_message._id,
          content: conv.last_message.content || null,
          encrypted_content: conv.last_message.encrypted_content || null,
          message_type: conv.last_message.message_type || conv.last_message.type || 'text',
          type: conv.last_message.message_type || conv.last_message.type || 'text',
          is_edited: conv.last_message.is_edited || false,
          createdAt: conv.last_message.createdAt,
          updatedAt: conv.last_message.updatedAt,
          sender: {
            _id: conv.lastMessageSender._id,
            clerkId: conv.lastMessageSender.clerkId,
            full_name: conv.lastMessageSender.full_name,
            username: conv.lastMessageSender.username,
            avatar: senderAvatarData ? (senderAvatarData.url || null) : null
          },
          attachments: (conv.lastMessageAttachments || []).map((att: any) => ({
            _id: att._id,
            url: att.url,
            name: att.name,
            type: att.type,
            size: att.size
          }))
        };
      }

      return {
        _id: conv._id,
        type: conv.type,
        name: conv.name,
        description: conv.description,
        is_pinned: conv.is_pinned,
        is_archived: conv.is_archived,
        last_activity: conv.last_activity,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        participants: participantsWithAvatar,
        avatar: conversationAvatar,
        last_message: lastMessage,
        unreadCount: conv.unreadCount
      };
    });

    return {
      success: true,
      data: {
        conversations: conversationsWithUnread,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    };
  } catch (error) {
    console.error('Error getting conversations:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get conversations'
    };
  }
}

export async function getConversationById(conversationId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: 'participants',
        select: 'clerkId full_name username avatar is_online last_seen',
        populate: {
          path: 'avatar',
          select: 'url name type'
        }
      })
      .populate({
        path: 'last_message',
        populate: [
          {
            path: 'sender',
            select: 'clerkId full_name username avatar',
            populate: {
              path: 'avatar',
              select: 'url name type'
            }
          },
          {
            path: 'attachments',
            select: 'url name type size'
          }
        ]
      })
      .populate('avatar', 'url name type');

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const isParticipant = conversation.participants.some(
      (p: any) => p._id.toString() === user._id.toString()
    );

    if (!isParticipant) {
      throw new Error('Unauthorized to access this conversation');
    }

    return {
      success: true,
      data: conversation
    };
  } catch (error) {
    console.error('Error getting conversation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get conversation'
    };
  }
}

export async function updateConversation(conversationId: string, data: UpdateConversationDTO) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const isAuthorized = conversation.type === 'group' 
      ? conversation.admin?.toString() === user._id.toString()
      : conversation.participants.includes(user._id);

    if (!isAuthorized) {
      throw new Error('Unauthorized to update this conversation');
    }

    // ✅ Store old values for system message
    const oldName = conversation.name;
    const oldDescription = conversation.description;

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { ...data, updated_at: new Date() },
      { new: true }
    );

    const populatedConversation = await populateConversation(updatedConversation);

    // ✅ Create system messages for specific changes
    if (conversation.type === 'group') {
      if (data.name && data.name !== oldName) {
        await Message.create({
          conversation: conversationId,
          sender: user._id,
          content: `${user.full_name} đã đổi tên nhóm thành "${data.name}"`,
          type: 'text',
          metadata: {
            isSystemMessage: true,
            action: 'update_group_name',
            updatedBy: userId,
            oldName: oldName,
            newName: data.name
          }
        });
      }

      if (data.description && data.description !== oldDescription) {
        await Message.create({
          conversation: conversationId,
          sender: user._id,
          content: `${user.full_name} đã thay đổi mô tả nhóm`,
          type: 'text',
          metadata: {
            isSystemMessage: true,
            action: 'update_group_description',
            updatedBy: userId,
            oldDescription: oldDescription,
            newDescription: data.description
          }
        });
      }
    }

    // ✅ Emit socket event
    try {
      await emitSocketEvent(
        'conversationUpdated',
        conversationId,
        {
          conversation_id: conversationId,
          updated_fields: data,
          conversation: populatedConversation,
          updated_by: userId
        },
        true
      );
      console.log(`✅ Emitted conversationUpdated for ${conversationId}`);
    } catch (socketError) {
      console.error('⚠️ Failed to emit socket event:', socketError);
    }

    return {
      success: true,
      data: populatedConversation
    };
  } catch (error) {
    console.error('Error updating conversation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update conversation'
    };
  }
}

// ============================================
// ADD PARTICIPANTS
// ============================================
export async function addParticipants(conversationId: string, participantIds: string[]) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    if (conversation.type !== 'group') {
      throw new Error('Can only add participants to group conversations');
    }

    if (conversation.admin?.toString() !== user._id.toString()) {
      throw new Error('Only admin can add participants');
    }

    const users = await User.find({ clerkId: { $in: participantIds } });
    const userObjectIds = users.map(u => u._id);

    await Conversation.findByIdAndUpdate(conversationId, {
      $addToSet: { participants: { $each: userObjectIds } }
    });

    const updatedConversation = await populateConversation(
      await Conversation.findById(conversationId)
    );

    // ✅ Create system message
    const addedNames = users.map(u => u.full_name).join(', ');
    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã thêm ${addedNames} vào nhóm`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'add_participants',
        addedBy: user.clerkId,
        addedUsers: users.map(u => ({
          clerkId: u.clerkId,
          full_name: u.full_name,
          username: u.username
        }))
      }
    });

    // ⭐ EMIT system message
    await emitSystemMessageAsNewMessage(conversationId, systemMessage._id.toString());

    return {
      success: true,
      data: updatedConversation
    };
  } catch (error) {
    console.error('Error adding participants:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add participants'
    };
  }
}

// ============================================
// REMOVE PARTICIPANT
// ============================================
export async function removeParticipant(conversationId: string, participantId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    if (conversation.type !== 'group') {
      throw new Error('Can only remove participants from group conversations');
    }

    const participantUser = await User.findOne({ clerkId: participantId });
    if (!participantUser) throw new Error('Participant not found');

    const isAdmin = conversation.admin?.toString() === user._id.toString();
    const isRemovingSelf = participantUser._id.toString() === user._id.toString();

    if (!isAdmin && !isRemovingSelf) {
      throw new Error('Only admin can remove other participants');
    }

    await Conversation.findByIdAndUpdate(conversationId, {
      $pull: { participants: participantUser._id }
    });

    const updatedConversation = await populateConversation(
      await Conversation.findById(conversationId)
    );

    // ✅ Create system message
    let messageContent: string;
    let actionType: string;
    
    if (isRemovingSelf) {
      messageContent = `${participantUser.full_name} đã rời khỏi nhóm`;
      actionType = 'leave_group';
    } else {
      messageContent = `${user.full_name} đã xóa ${participantUser.full_name} khỏi nhóm`;
      actionType = 'remove_participant';
    }

    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: messageContent,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: actionType,
        removedBy: user.clerkId,
        isKicked: !isRemovingSelf,
        removedUser: {
          clerkId: participantUser.clerkId,
          full_name: participantUser.full_name,
          username: participantUser.username
        }
      }
    });

    // ⭐ EMIT system message
    await emitSystemMessageAsNewMessage(conversationId, systemMessage._id.toString());

    return {
      success: true,
      data: updatedConversation
    };
  } catch (error) {
    console.error('Error removing participant:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove participant'
    };
  }
}


export async function deleteConversation(conversationId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const canDelete = conversation.type === 'group' 
      ? conversation.admin?.toString() === user._id.toString()
      : conversation.participants.includes(user._id);

    if (!canDelete) {
      throw new Error('Unauthorized to delete this conversation');
    }

    // ✅ Emit socket event BEFORE deleting
    try {
      await emitSocketEvent(
        'conversationDeleted',
        conversationId,
        {
          conversation_id: conversationId,
          deleted_by: userId,
          type: conversation.type,
          name: conversation.name
        },
        true
      );
      console.log(`✅ Emitted conversationDeleted for ${conversationId}`);
    } catch (socketError) {
      console.error('⚠️ Failed to emit socket event:', socketError);
    }

    await Message.deleteMany({ conversation: conversationId });
    await Conversation.findByIdAndDelete(conversationId);

    return {
      success: true,
      data: { conversationId }
    };
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete conversation'
    };
  }
}

async function populateConversation(conversation: any) {
  return await Conversation.populate(conversation, [
    {
      path: 'participants',
      select: 'clerkId full_name username avatar is_online last_seen',
      populate: {
        path: 'avatar',
        select: 'url name type'
      }
    },
    {
      path: 'last_message',
      populate: [
        {
          path: 'sender',
          select: 'clerkId full_name username avatar',
          populate: {
            path: 'avatar',
            select: 'url name type'
          }
        },
        {
          path: 'attachments',
          select: 'url name type size'
        }
      ]
    },
    {
      path: 'avatar',
      select: 'url name type'
    }
  ]);
}


export async function getConversationMedia(
  conversationId: string,
  mediaType: 'image' | 'video' | 'file' | 'audio',
  page: number = 1,
  limit: number = 20
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error('Not a participant');

    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversation: conversationId,
      type: mediaType,
      attachments: { $exists: true, $ne: [] },
      $or: [
        { deleted_by: { $size: 0 } },
        { 'deleted_by.delete_type': { $ne: 'both' } }
      ]
    })
      .populate('attachments', 'file_name file_type file_size url')
      .populate('sender', 'clerkId full_name username avatar')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({
      conversation: conversationId,
      type: mediaType,
      attachments: { $exists: true, $ne: [] },
      $or: [
        { deleted_by: { $size: 0 } },
        { 'deleted_by.delete_type': { $ne: 'both' } }
      ]
    });

    return {
      success: true,
      data: {
        messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    console.error('Error getting conversation media:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get media'
    };
  }
}

export async function searchMessages(
  conversationId: string,
  searchQuery: string,
  page: number = 1,
  limit: number = 20
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error('Not a participant');

    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversation: conversationId,
      content: { $regex: searchQuery, $options: 'i' },
      $or: [
        { deleted_by: { $size: 0 } },
        { 'deleted_by.delete_type': { $ne: 'both' } }
      ]
    })
      .populate('sender', 'clerkId full_name username avatar')
      .populate('attachments', 'file_name file_type file_size url')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({
      conversation: conversationId,
      content: { $regex: searchQuery, $options: 'i' },
      $or: [
        { deleted_by: { $size: 0 } },
        { 'deleted_by.delete_type': { $ne: 'both' } }
      ]
    });

    return {
      success: true,
      data: {
        messages,
        searchQuery,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    console.error('Error searching messages:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search messages'
    };
  }
}

// ============================================
// LEAVE GROUP
// ============================================
export async function leaveGroup(conversationId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    if (conversation.type !== 'group') {
      throw new Error('This is not a group conversation');
    }

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error('Not a participant');

    const isAdmin = conversation.admin?.toString() === user._id.toString();
    
    if (isAdmin) {
      const otherParticipants = conversation.participants.filter(
        (p: any) => p.toString() !== user._id.toString()
      );
      
      if (otherParticipants.length > 0) {
        conversation.admin = otherParticipants[0];
        
        const newAdmin = await User.findById(otherParticipants[0]);
        if (newAdmin) {
          const transferMessage = await Message.create({
            conversation: conversationId,
            sender: user._id,
            content: `${user.full_name} đã chuyển quyền quản trị viên cho ${newAdmin.full_name}`,
            type: 'text',
            metadata: {
              isSystemMessage: true,
              action: 'auto_transfer_admin',
              fromUserId: user.clerkId,
              fromUserName: user.full_name,
              toUserId: newAdmin.clerkId,
              toUserName: newAdmin.full_name,
              reason: 'admin_leaving'
            }
          });

          // ⭐ EMIT auto transfer message
          await emitSystemMessageAsNewMessage(conversationId, transferMessage._id.toString());
        }
      }
    }

    conversation.participants = conversation.participants.filter(
      (p: any) => p.toString() !== user._id.toString()
    );

    await conversation.save();

    // ✅ Create system message
    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã rời khỏi nhóm`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'leave_group',
        userId: user.clerkId,
        wasAdmin: isAdmin,
        removedUser: {
          clerkId: user.clerkId,
          full_name: user.full_name,
          username: user.username
        }
      }
    });

    // ⭐ EMIT system message
    await emitSystemMessageAsNewMessage(conversationId, systemMessage._id.toString());

    return {
      success: true,
      message: 'Left group successfully',
      data: systemMessage
    };
  } catch (error) {
    console.error('Error leaving group:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to leave group'
    };
  }
}


// ============================================
// TRANSFER ADMIN
// ============================================
export async function transferAdmin(conversationId: string, newAdminId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    if (conversation.type !== 'group') {
      throw new Error('Only group conversations have admin');
    }

    if (conversation.admin?.toString() !== user._id.toString()) {
      throw new Error('Only current admin can transfer admin rights');
    }

    const newAdmin = await User.findOne({ clerkId: newAdminId });
    if (!newAdmin) throw new Error('New admin not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === newAdmin._id.toString()
    );
    if (!isParticipant) {
      throw new Error('New admin must be a participant of the group');
    }

    if (newAdmin._id.toString() === user._id.toString()) {
      throw new Error('You are already the admin');
    }

    conversation.admin = newAdmin._id;
    await conversation.save();

    // ✅ Create system message
    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã chuyển quyền quản trị viên cho ${newAdmin.full_name}`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'transfer_admin',
        fromUserId: user.clerkId,
        fromUserName: user.full_name,
        toUserId: newAdmin.clerkId,
        toUserName: newAdmin.full_name
      }
    });

    // ⭐ EMIT system message
    await emitSystemMessageAsNewMessage(conversationId, systemMessage._id.toString());

    const updatedConversation = await populateConversation(conversation);

    return {
      success: true,
      message: 'Admin transferred successfully',
      data: updatedConversation
    };
  } catch (error) {
    console.error('Error transferring admin:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transfer admin'
    };
  }
}

export async function getGroupMembers(
  conversationId: string,
  page: number = 1,
  limit: number = 50
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: 'participants',
        select: 'clerkId full_name username email avatar is_online last_seen created_at',
        populate: {
          path: 'avatar',
          select: 'url name type'
        }
      })
      .populate({
        path: 'admin',
        select: 'clerkId full_name username avatar'
      });

    if (!conversation) throw new Error('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p._id.toString() === user._id.toString()
    );
    if (!isParticipant) {
      throw new Error('You are not a participant of this conversation');
    }

    const skip = (page - 1) * limit;
    const participants = conversation.participants.slice(skip, skip + limit);
    
    const membersWithStats = await Promise.all(
      participants.map(async (participant: any) => {
        const messageCount = await Message.countDocuments({
          conversation: conversationId,
          sender: participant._id,
          $or: [
            { deleted_by: { $size: 0 } },
            { 'deleted_by.delete_type': { $ne: 'both' } }
          ]
        });

        const lastMessage = await Message.findOne({
          conversation: conversationId,
          sender: participant._id,
          $or: [
            { deleted_by: { $size: 0 } },
            { 'deleted_by.delete_type': { $ne: 'both' } }
          ]
        }).sort({ created_at: -1 });

        const participantData = participant.toJSON();

        return {
          ...participantData,
          avatar: participantData.avatar?.url || null,
          isAdmin: conversation.admin?._id.toString() === participant._id.toString(),
          messageCount,
          lastMessageAt: lastMessage?.created_at || null,
          isCurrentUser: participant.clerkId === userId
        };
      })
    );

    const total = conversation.participants.length;

    return {
      success: true,
      data: {
        conversationId: conversation._id,
        conversationType: conversation.type,
        conversationName: conversation.name,
        admin: conversation.admin,
        members: membersWithStats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    console.error('Error getting group members:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get group members'
    };
  }
}

// ============================================
// UPDATE GROUP AVATAR
// ============================================
export async function updateGroupAvatar(
  conversationId: string,
  avatarFile: File
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    if (conversation.type !== 'group') {
      throw new Error('Only group conversations can have custom avatars');
    }

    if (conversation.admin?.toString() !== user._id.toString()) {
      throw new Error('Only admin can update group avatar');
    }

    const uploadResult = await uploadFileToCloudinary(
      avatarFile,
      'chatapp/group-avatars',
      userId
    );

    if (!uploadResult.success || !uploadResult.file) {
      throw new Error(uploadResult.error || 'Failed to upload avatar');
    }

    if (conversation.avatar) {
      const oldAvatarId = conversation.avatar.toString();
      try {
        await deleteFileFromCloudinary(oldAvatarId);
      } catch (error) {
        console.warn('Failed to delete old avatar:', error);
      }
    }

    const avatarFileDoc = await File.findById(uploadResult.file.id);
    if (!avatarFileDoc) {
      throw new Error('Avatar file not found after upload');
    }

    conversation.avatar = avatarFileDoc._id;
    await conversation.save();

    // ✅ Create system message
    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã thay đổi ảnh đại diện nhóm`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'update_group_avatar',
        updatedBy: user.clerkId,
        updatedByName: user.full_name,
        avatarUrl: uploadResult.file.url
      }
    });

    // ⭐ EMIT system message
    await emitSystemMessageAsNewMessage(conversationId, systemMessage._id.toString());

    const updatedConversation = await populateConversation(conversation);

    return {
      success: true,
      message: 'Group avatar updated successfully',
      data: {
        conversation: updatedConversation,
        avatar: uploadResult.file
      }
    };
  } catch (error) {
    console.error('Error updating group avatar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update group avatar'
    };
  }
}



/**
 * ✨ NEW: Giải tán nhóm (chỉ admin)
 * Khác với deleteConversation - dissolveGroup sẽ:
 * 1. Tạo system message thông báo nhóm bị giải tán
 * 2. Xóa tất cả participants
 * 3. Mark conversation là archived
 * 4. Không xóa messages (giữ lại lịch sử)
 */
// ============================================
// DISSOLVE GROUP
// ============================================
export async function dissolveGroup(conversationId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    if (conversation.type !== 'group') {
      throw new Error('Only group conversations can be dissolved');
    }

    if (conversation.admin?.toString() !== user._id.toString()) {
      throw new Error('Only admin can dissolve the group');
    }

    // ✅ Create system message BEFORE dissolving
    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã giải tán nhóm`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'dissolve_group',
        dissolvedBy: user.clerkId,
        dissolvedByName: user.full_name,
        dissolvedAt: new Date()
      }
    });

    // ⭐ EMIT system message FIRST
    await emitSystemMessageAsNewMessage(conversationId, systemMessage._id.toString());

    const participantIds = conversation.participants.map((p: any) => p.toString());

    conversation.is_archived = true;
    conversation.participants = [];
    conversation.admin = undefined;
    conversation.description = `[Nhóm đã bị giải tán bởi ${user.full_name}]`;
    await conversation.save();

    return {
      success: true,
      message: 'Group dissolved successfully',
      data: {
        conversationId,
        dissolvedBy: user.clerkId,
        systemMessage
      }
    };
  } catch (error) {
    console.error('Error dissolving group:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to dissolve group'
    };
  }
}

/**
 * Lấy lịch sử hoạt động nhóm (system messages)
 */
export async function getGroupHistory(
  conversationId: string,
  page: number = 1,
  limit: number = 50
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    // ✅ Check if user is/was a participant (for archived groups)
    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );

    // ✅ For dissolved groups, check if user was ever a participant
    const wasParticipant = !isParticipant && conversation.is_archived
      ? await Message.exists({
          conversation: conversationId,
          $or: [
            { sender: user._id },
            { 'read_by.user': user._id }
          ]
        })
      : false;

    if (!isParticipant && !wasParticipant) {
      throw new Error('Not authorized to view group history');
    }

    const skip = (page - 1) * limit;

    // ✅ Get system messages only
    const systemMessages = await Message.find({
      conversation: conversationId,
      'metadata.isSystemMessage': true
    })
      .populate({
        path: 'sender',
        select: 'clerkId full_name username avatar',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({
      conversation: conversationId,
      'metadata.isSystemMessage': true
    });

    return {
      success: true,
      data: {
        history: systemMessages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    console.error('Error getting group history:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get group history'
    };
  }
}

export async function markConversationAsRead(conversationId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) {
      throw new Error('Not a participant in this conversation');
    }

    const result = await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: user._id },
        'read_by.user': { $ne: user._id }
      },
      {
        $addToSet: {
          read_by: {
            user: user._id,
            read_at: new Date()
          }
        }
      }
    );

    console.log(`✅ Conversation ${conversationId} marked as read by ${userId}`);
    console.log(`📊 Updated ${result.modifiedCount} messages`);

    // ✅ Emit socket event
    try {
      const socketUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/socket/emit`;
      
      await fetch(socketUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'conversationMarkedAsRead',
          conversationId: conversationId,
          emitToParticipants: true,
          data: {
            conversation_id: conversationId,
            read_by: userId,
            read_at: new Date().toISOString(),
            messages_updated: result.modifiedCount
          }
        })
      });
      
      console.log(`✅ Emitted conversationMarkedAsRead event for ${conversationId}`);
    } catch (socketError) {
      console.error('⚠️ Failed to emit socket event:', socketError);
    }

    return {
      success: true,
      data: {
        conversationId,
        messagesMarked: result.modifiedCount
      }
    };
  } catch (error) {
    console.error('❌ Error marking conversation as read:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark conversation as read'
    };
  }
}

// ✨ NEW: Get conversation history (system messages only)
export async function getConversationHistory(
  conversationId: string,
  page: number = 1,
  limit: number = 50
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error('Not a participant');

    const skip = (page - 1) * limit;

    // Get only system messages
    const systemMessages = await Message.find({
      conversation: conversationId,
      'metadata.isSystemMessage': true
    })
      .populate({
        path: 'sender',
        select: 'clerkId full_name username avatar',
        populate: {
          path: 'avatar',
          select: 'url'
        }
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({
      conversation: conversationId,
      'metadata.isSystemMessage': true
    });

    return {
      success: true,
      data: {
        systemMessages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get conversation history'
    };
  }
}
