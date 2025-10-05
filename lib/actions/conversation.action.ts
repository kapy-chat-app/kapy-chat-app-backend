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

export async function createConversation(data: CreateConversationDTO) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const { type, participantIds, name, description } = data;

    // Validate participants
    if (participantIds.length < 1) {
      throw new Error('At least one participant is required');
    }

    // For private conversations, limit to 2 participants
    if (type === 'private' && participantIds.length !== 2) {
      throw new Error('Private conversations must have exactly 2 participants');
    }

    // Check if users exist
    const users = await User.find({ clerkId: { $in: participantIds } });
    if (users.length !== participantIds.length) {
      throw new Error('Some users not found');
    }

    const userObjectIds = users.map(user => user._id);

    // Check if private conversation already exists
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

    // Create conversation
    const conversation = await Conversation.create({
      type,
      participants: userObjectIds,
      name: type === 'group' ? name : undefined,
      description: type === 'group' ? description : undefined,
      created_by: users.find(u => u.clerkId === userId)?._id,
      admin: type === 'group' ? users.find(u => u.clerkId === userId)?._id : undefined
    });

    const populatedConversation = await populateConversation(conversation);

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

    const conversations = await Conversation.find({
      participants: user._id,
      is_archived: false
    })
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
    .populate('avatar', 'url name type')
    .sort({ is_pinned: -1, last_activity: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Conversation.countDocuments({
      participants: user._id,
      is_archived: false
    });

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          'read_by.user': { $ne: user._id },
          sender: { $ne: user._id }
        });

        const convData = conv.toJSON();

        // Flatten avatar URLs for participants
        const participantsWithAvatar = convData.participants?.map((p: any) => ({
          ...p,
          avatar: p.avatar?.url || null
        }));

        // ✅ QUAN TRỌNG: Lấy avatar cho private conversation từ participant
        let conversationAvatar = convData.avatar?.url || null;
        
        // Nếu là private chat và không có avatar, lấy avatar của người kia
        if (convData.type === 'private' && !conversationAvatar) {
          const otherParticipant = participantsWithAvatar?.find(
            (p: any) => p.clerkId !== userId
          );
          conversationAvatar = otherParticipant?.avatar || null;
        }

        // Flatten avatar URL for last_message sender
        let lastMessage = convData.last_message;
        if (lastMessage?.sender) {
          lastMessage = {
            ...lastMessage,
            sender: {
              ...lastMessage.sender,
              avatar: lastMessage.sender.avatar?.url || null
            }
          };
        }

        return {
          ...convData,
          participants: participantsWithAvatar,
          avatar: conversationAvatar, // ✅ Giờ sẽ có avatar từ participant
          last_message: lastMessage,
          unreadCount
        };
      })
    );

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

    // Check if user is participant
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

    // Check if user is admin (for group) or participant (for private)
    const isAuthorized = conversation.type === 'group' 
      ? conversation.admin?.toString() === user._id.toString()
      : conversation.participants.includes(user._id);

    if (!isAuthorized) {
      throw new Error('Unauthorized to update this conversation');
    }

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { ...data, updated_at: new Date() },
      { new: true }
    );

    return {
      success: true,
      data: await populateConversation(updatedConversation)
    };
  } catch (error) {
    console.error('Error updating conversation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update conversation'
    };
  }
}

export async function addParticipants(conversationId: string, participantIds: string[]) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    // Only group conversations can add participants
    if (conversation.type !== 'group') {
      throw new Error('Can only add participants to group conversations');
    }

    // Check if user is admin
    if (conversation.admin?.toString() !== user._id.toString()) {
      throw new Error('Only admin can add participants');
    }

    // Get user ObjectIds
    const users = await User.find({ clerkId: { $in: participantIds } });
    const userObjectIds = users.map(u => u._id);

    // Add participants
    await Conversation.findByIdAndUpdate(conversationId, {
      $addToSet: { participants: { $each: userObjectIds } }
    });

    const updatedConversation = await populateConversation(
      await Conversation.findById(conversationId)
    );

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

export async function removeParticipant(conversationId: string, participantId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    // Only group conversations can remove participants
    if (conversation.type !== 'group') {
      throw new Error('Can only remove participants from group conversations');
    }

    const participantUser = await User.findOne({ clerkId: participantId });
    if (!participantUser) throw new Error('Participant not found');

    // Check if user is admin or removing themselves
    const isAdmin = conversation.admin?.toString() === user._id.toString();
    const isRemovingSelf = participantUser._id.toString() === user._id.toString();

    if (!isAdmin && !isRemovingSelf) {
      throw new Error('Only admin can remove other participants');
    }

    // Remove participant
    await Conversation.findByIdAndUpdate(conversationId, {
      $pull: { participants: participantUser._id }
    });

    const updatedConversation = await populateConversation(
      await Conversation.findById(conversationId)
    );

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

    // Check permissions
    const canDelete = conversation.type === 'group' 
      ? conversation.admin?.toString() === user._id.toString()
      : conversation.participants.includes(user._id);

    if (!canDelete) {
      throw new Error('Unauthorized to delete this conversation');
    }

    // Delete all messages in conversation
    await Message.deleteMany({ conversation: conversationId });

    // Delete conversation
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

// Helper function to populate conversation data
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
      // Không lấy tin nhắn đã bị thu hồi (deleted_by.delete_type = 'both')
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
      // Không lấy tin nhắn đã bị thu hồi
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

    // Xóa user khỏi participants
    conversation.participants = conversation.participants.filter(
      (p: any) => p.toString() !== user._id.toString()
    );

    await conversation.save();

    // Tạo tin nhắn hệ thống thông báo rời nhóm
    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã rời khỏi nhóm`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'leave_group',
        userId: user.clerkId
      }
    });

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

/**
 * Chuyển nhượng quyền admin cho thành viên khác
 */
export async function transferAdmin(conversationId: string, newAdminId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    // Chỉ group mới có admin
    if (conversation.type !== 'group') {
      throw new Error('Only group conversations have admin');
    }

    // Kiểm tra quyền: chỉ admin hiện tại mới có thể chuyển nhượng
    if (conversation.admin?.toString() !== user._id.toString()) {
      throw new Error('Only current admin can transfer admin rights');
    }

    // Tìm user mới
    const newAdmin = await User.findOne({ clerkId: newAdminId });
    if (!newAdmin) throw new Error('New admin not found');

    // Kiểm tra user mới có phải là thành viên không
    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === newAdmin._id.toString()
    );
    if (!isParticipant) {
      throw new Error('New admin must be a participant of the group');
    }

    // Không thể chuyển cho chính mình
    if (newAdmin._id.toString() === user._id.toString()) {
      throw new Error('You are already the admin');
    }

    // Cập nhật admin
    conversation.admin = newAdmin._id;
    await conversation.save();

    // Tạo tin nhắn hệ thống
    await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã chuyển quyền quản trị viên cho ${newAdmin.full_name}`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'transfer_admin',
        fromUserId: user.clerkId,
        toUserId: newAdmin.clerkId
      }
    });

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

/**
 * Lấy danh sách thành viên của nhóm với thông tin chi tiết
 */
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

    // Kiểm tra quyền truy cập
    const isParticipant = conversation.participants.some(
      (p: any) => p._id.toString() === user._id.toString()
    );
    if (!isParticipant) {
      throw new Error('You are not a participant of this conversation');
    }

    // Lấy thông tin thành viên với phân trang
    const skip = (page - 1) * limit;
    const participants = conversation.participants.slice(skip, skip + limit);
    
    // Lấy số lượng tin nhắn của từng thành viên
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

        // Lấy tin nhắn cuối cùng của thành viên
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


/**
 * Cập nhật avatar nhóm
 */
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

    // Chỉ group mới có avatar riêng
    if (conversation.type !== 'group') {
      throw new Error('Only group conversations can have custom avatars');
    }

    // Kiểm tra quyền: chỉ admin mới được đổi avatar
    if (conversation.admin?.toString() !== user._id.toString()) {
      throw new Error('Only admin can update group avatar');
    }

    // Upload avatar mới
    const uploadResult = await uploadFileToCloudinary(
      avatarFile,
      'chatapp/group-avatars',
      userId
    );

    if (!uploadResult.success || !uploadResult.file) {
      throw new Error(uploadResult.error || 'Failed to upload avatar');
    }

    // Xóa avatar cũ nếu có
    if (conversation.avatar) {
      const oldAvatarId = conversation.avatar.toString();
      try {
        await deleteFileFromCloudinary(oldAvatarId);
      } catch (error) {
        console.warn('Failed to delete old avatar:', error);
        // Không throw error, vẫn tiếp tục update
      }
    }

    // Tìm File document
    const avatarFileDoc = await File.findById(uploadResult.file.id);
    if (!avatarFileDoc) {
      throw new Error('Avatar file not found after upload');
    }

    // Cập nhật avatar cho conversation
    conversation.avatar = avatarFileDoc._id;
    await conversation.save();

    // Tạo tin nhắn hệ thống
    await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: `${user.full_name} đã thay đổi ảnh đại diện nhóm`,
      type: 'text',
      metadata: {
        isSystemMessage: true,
        action: 'update_group_avatar',
        avatarUrl: uploadResult.file.url
      }
    });

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