/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/message.action.ts - FIXED with populated read_by
import { CreateMessageDTO } from '@/dtos/message.dto';
import mongoose from 'mongoose';
import { connectToDatabase } from '../mongoose';
import { auth } from '@clerk/nextjs/server';
import User from '@/database/user.model';
import Conversation from '@/database/conversation.model';
import Message from '@/database/message.model';

// ============================================
// HELPER: Emit Socket Events
// ============================================
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
// CREATE MESSAGE
// ============================================
export async function createMessage(data: CreateMessageDTO) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const { conversationId, content, type, attachments, replyTo } = data;

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'clerkId full_name username avatar');
    if (!conversation) throw new Error('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p._id.toString() === user._id.toString()
    );
    if (!isParticipant) throw new Error('Not a participant');

    if (type === 'text') {
      if (!content || content.trim().length === 0) {
        throw new Error('Text messages must have content');
      }
    } else {
      if ((!attachments || attachments.length === 0) && (!content || content.trim().length === 0)) {
        throw new Error('Non-text messages must have attachments or content');
      }
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: user._id,
      content: content?.trim(),
      type,
      attachments: attachments?.map(id => new mongoose.Types.ObjectId(id)) || [],
      reply_to: replyTo ? new mongoose.Types.ObjectId(replyTo) : undefined
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      last_message: message._id,
      last_activity: new Date()
    });

    const populatedMessage = await Message.findById(message._id)
      .populate({
        path: 'sender',
        select: 'clerkId full_name username avatar',
        populate: { path: 'avatar', select: 'url' }
      })
      .populate('attachments', 'file_name file_type file_size url')
      .populate({
        path: 'reply_to',
        populate: {
          path: 'sender',
          select: 'clerkId full_name username avatar',
          populate: { path: 'avatar', select: 'url' }
        }
      })
      .populate({
        path: 'read_by.user',
        select: 'clerkId full_name username avatar',
        populate: { path: 'avatar', select: 'url' }
      });
    
    if (!populatedMessage) {
      throw new Error('Failed to retrieve created message');
    }

    const messageObj = populatedMessage.toObject();

    // Transform avatar URLs
    if (messageObj.sender?.avatar?.url) {
      messageObj.sender.avatar = messageObj.sender.avatar.url;
    }
    if (messageObj.reply_to?.sender?.avatar?.url) {
      messageObj.reply_to.sender.avatar = messageObj.reply_to.sender.avatar.url;
    }
    // Transform read_by avatars
    if (messageObj.read_by) {
      messageObj.read_by = messageObj.read_by.map((rb: any) => ({
        user: rb.user._id || rb.user,
        userInfo: rb.user._id ? {
          clerkId: rb.user.clerkId,
          full_name: rb.user.full_name,
          username: rb.user.username,
          avatar: rb.user.avatar?.url || rb.user.avatar
        } : null,
        read_at: rb.read_at
      }));
    }

    await emitSocketEvent(
      'newMessage', 
      conversationId, 
      {
        message_id: messageObj._id.toString(),
        conversation_id: conversationId,
        sender_id: user.clerkId,
        sender_name: user.full_name,
        sender_username: user.username,
        sender_avatar: messageObj.sender.avatar,
        message_content: content,
        message_type: type,
        message: {
          ...messageObj,
          _id: messageObj._id.toString(),
          conversation: conversationId,
          created_at: messageObj.created_at || new Date(),
          updated_at: messageObj.updated_at || new Date(),
        }
      },
      true
    );

    return {
      success: true,
      data: messageObj
    };
  } catch (error) {
    console.error('Error creating message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create message'
    };
  }
}

// ============================================
// GET MESSAGES - FIXED with populated read_by
// ============================================
export async function getMessages(
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
    if (!isParticipant) throw new Error('Not a participant in this conversation');

    const skip = (page - 1) * limit;

    const messages = await Message.aggregate([
      {
        $match: {
          conversation: new mongoose.Types.ObjectId(conversationId),
          $nor: [
            {
              'deleted_by': {
                $elemMatch: {
                  user: user._id,
                  delete_type: 'only_me'
                }
              }
            },
            {
              'deleted_by': {
                $elemMatch: {
                  delete_type: 'both'
                }
              }
            }
          ]
        }
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'sender',
          foreignField: '_id',
          as: 'sender',
          pipeline: [
            {
              $lookup: {
                from: 'files',
                localField: 'avatar',
                foreignField: '_id',
                as: 'avatarData'
              }
            },
            {
              $project: {
                clerkId: 1,
                full_name: 1,
                username: 1,
                avatar: { $ifNull: [{ $arrayElemAt: ['$avatarData.url', 0] }, null] }
              }
            }
          ]
        }
      },
      { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'files',
          localField: 'attachments',
          foreignField: '_id',
          as: 'attachments'
        }
      },
      {
        $lookup: {
          from: 'messages',
          localField: 'reply_to',
          foreignField: '_id',
          as: 'reply_to',
          pipeline: [
            {
              $lookup: {
                from: 'users',
                localField: 'sender',
                foreignField: '_id',
                as: 'sender',
                pipeline: [
                  {
                    $lookup: {
                      from: 'files',
                      localField: 'avatar',
                      foreignField: '_id',
                      as: 'avatarData'
                    }
                  },
                  {
                    $project: {
                      clerkId: 1,
                      full_name: 1,
                      username: 1,
                      avatar: { $ifNull: [{ $arrayElemAt: ['$avatarData.url', 0] }, null] }
                    }
                  }
                ]
              }
            },
            { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'files',
                localField: 'attachments',
                foreignField: '_id',
                as: 'attachments'
              }
            }
          ]
        }
      },
      { $unwind: { path: '$reply_to', preserveNullAndEmptyArrays: true } },
      // ✅ POPULATE read_by users
      {
        $lookup: {
          from: 'users',
          localField: 'read_by.user',
          foreignField: '_id',
          as: 'read_by_users'
        }
      },
      {
        $addFields: {
          read_by: {
            $map: {
              input: '$read_by',
              as: 'rb',
              in: {
                user: '$$rb.user',
                read_at: '$$rb.read_at',
                userInfo: {
                  $let: {
                    vars: {
                      matchedUser: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: '$read_by_users',
                              as: 'u',
                              cond: { $eq: ['$$u._id', '$$rb.user'] }
                            }
                          },
                          0
                        ]
                      }
                    },
                    in: {
                      clerkId: '$$matchedUser.clerkId',
                      full_name: '$$matchedUser.full_name',
                      username: '$$matchedUser.username',
                      avatar: '$$matchedUser.avatar'
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Populate avatars for read_by users
      {
        $lookup: {
          from: 'files',
          localField: 'read_by.userInfo.avatar',
          foreignField: '_id',
          as: 'read_by_avatars'
        }
      },
      {
        $addFields: {
          read_by: {
            $map: {
              input: '$read_by',
              as: 'rb',
              in: {
                user: '$$rb.user',
                read_at: '$$rb.read_at',
                userInfo: {
                  clerkId: '$$rb.userInfo.clerkId',
                  full_name: '$$rb.userInfo.full_name',
                  username: '$$rb.userInfo.username',
                  avatar: {
                    $let: {
                      vars: {
                        avatarFile: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: '$read_by_avatars',
                                as: 'av',
                                cond: { $eq: ['$$av._id', '$$rb.userInfo.avatar'] }
                              }
                            },
                            0
                          ]
                        }
                      },
                      in: { $ifNull: ['$$avatarFile.url', null] }
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        $project: {
          read_by_users: 0,
          read_by_avatars: 0
        }
      }
    ]);

    const total = await Message.countDocuments({
      conversation: conversationId,
      $nor: [
        {
          'deleted_by': {
            $elemMatch: {
              user: user._id,
              delete_type: 'only_me'
            }
          }
        },
        {
          'deleted_by': {
            $elemMatch: {
              delete_type: 'both'
            }
          }
        }
      ]
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
          hasPrev: page > 1
        }
      }
    };
  } catch (error) {
    console.error('Error getting messages:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get messages'
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
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const message = await Message.findById(messageId);
    if (!message) throw new Error('Message not found');

    if (message.sender.toString() !== user._id.toString()) {
      throw new Error('Only sender can edit message');
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        content: content.trim(),
        is_edited: true,
        edited_at: new Date()
      },
      { new: true }
    )
    .populate({
      path: 'sender',
      select: 'clerkId full_name username avatar',
      populate: { path: 'avatar', select: 'url' }
    })
    .populate('attachments', 'file_name file_type file_size url')
    .populate({
      path: 'read_by.user',
      select: 'clerkId full_name username avatar',
      populate: { path: 'avatar', select: 'url' }
    });

    await emitSocketEvent('updateMessage', message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      new_content: content.trim(),
      edited_by: userId,
      edited_at: new Date()
    });

    return {
      success: true,
      data: updatedMessage
    };
  } catch (error) {
    console.error('Error updating message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update message'
    };
  }
}

// ============================================
// DELETE MESSAGE
// ============================================
export async function deleteMessage(
  messageId: string, 
  deleteType: 'only_me' | 'both' = 'only_me'
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const message = await Message.findById(messageId);
    if (!message) throw new Error('Message not found');

    if (deleteType === 'both' && message.sender.toString() !== user._id.toString()) {
      throw new Error('Only sender can recall message');
    }

    await Message.findByIdAndUpdate(messageId, {
      $addToSet: {
        deleted_by: {
          user: user._id,
          deleted_at: new Date(),
          delete_type: deleteType
        }
      }
    });

    await emitSocketEvent('deleteMessage', message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      delete_type: deleteType
    });

    return {
      success: true,
      data: { messageId, deleteType }
    };
  } catch (error) {
    console.error('Error deleting message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete message'
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
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const message = await Message.findById(messageId);
    if (!message) throw new Error('Message not found');

    await Message.findByIdAndUpdate(messageId, {
      $pull: { reactions: { user: user._id } }
    });

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        $addToSet: {
          reactions: {
            user: user._id,
            type: reactionType,
            created_at: new Date()
          }
        }
      },
      { new: true }
    )
    .populate({
      path: 'reactions.user',
      select: 'clerkId full_name username avatar',
      populate: { path: 'avatar', select: 'url' }
    });

    const transformedReactions = updatedMessage?.reactions.map((r: any) => ({
      user: {
        _id: r.user._id,
        clerkId: r.user.clerkId,
        full_name: r.user.full_name,
        username: r.user.username,
        avatar: r.user.avatar?.url || r.user.avatar
      },
      type: r.type,
      created_at: r.created_at
    })) || [];

    await emitSocketEvent('newReaction', message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      reaction: reactionType,
      reactions: transformedReactions
    });

    return {
      success: true,
      data: {
        messageId,
        reactions: transformedReactions
      }
    };
  } catch (error) {
    console.error('Error adding reaction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add reaction'
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
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const message = await Message.findById(messageId);
    if (!message) throw new Error('Message not found');

    const userReaction = message.reactions.find(
      (r: any) => r.user.toString() === user._id.toString()
    );

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $pull: { reactions: { user: user._id } } },
      { new: true }
    )
    .populate({
      path: 'reactions.user',
      select: 'clerkId full_name username avatar',
      populate: { path: 'avatar', select: 'url' }
    });

    const transformedReactions = updatedMessage?.reactions.map((r: any) => ({
      user: {
        _id: r.user._id,
        clerkId: r.user.clerkId,
        full_name: r.user.full_name,
        username: r.user.username,
        avatar: r.user.avatar?.url || r.user.avatar
      },
      type: r.type,
      created_at: r.created_at
    })) || [];

    await emitSocketEvent('deleteReaction', message.conversation.toString(), {
      message_id: messageId,
      user_id: userId,
      reaction: userReaction?.type,
      reactions: transformedReactions
    });

    return {
      success: true,
      data: {
        messageId,
        reactions: transformedReactions
      }
    };
  } catch (error) {
    console.error('Error removing reaction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove reaction'
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
    if (!userId) throw new Error('Unauthorized');

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error('User not found');

    const message = await Message.findById(messageId);
    if (!message) throw new Error('Message not found');

    if (message.sender.toString() === user._id.toString()) {
      console.log(`⏭️ Skipping mark as read: User is the sender`);
      return {
        success: true,
        data: { messageId, alreadyRead: true, skipped: true }
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
            read_at: new Date()
          }
        }
      });

      console.log(`✅ Message ${messageId} marked as read by ${userId}`);

      // ✅ Populate user info for socket event
      const userInfo = {
        clerkId: user.clerkId,
        full_name: user.full_name,
        username: user.username,
        avatar: user.avatar
      };

      try {
        const socketUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/socket/emit`;
        
        await fetch(socketUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'messageRead',
            conversationId: message.conversation.toString(),
            emitToParticipants: true,
            data: {
              message_id: messageId,
              conversation_id: message.conversation.toString(),
              user_id: userId,
              user_info: userInfo,
              read_at: new Date().toISOString()
            }
          })
        });
        
        console.log(`✅ Emitted messageRead event for message ${messageId}`);
      } catch (socketError) {
        console.error('⚠️ Failed to emit socket event:', socketError);
      }
    } else {
      console.log(`⏭️ Message ${messageId} already marked as read by ${userId}`);
    }

    return {
      success: true,
      data: { messageId, alreadyRead }
    };
  } catch (error) {
    console.error('❌ Error marking message as read:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark message as read'
    };
  }
}