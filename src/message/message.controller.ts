import { Request, Response } from 'express';
import * as messageService from './message.service';
import Message from './message.model';
import { userSocketMap, io } from '../sockets/socket';
import fs from 'fs';

interface AuthRequest extends Request {
  user?: { _id: { toString(): string } };
}

function emitToParticipants(
  participantIds: { toString(): string }[],
  senderId: string,
  event: string,
  payload: unknown,
  includeSender = false
) {
  participantIds.forEach((participantId) => {
    const id = participantId.toString();
    if (!includeSender && id === senderId.toString()) return;
    const userSockets = userSocketMap[id];
    if (userSockets) {
      userSockets.forEach((socketId) => io.to(socketId).emit(event, payload));
    }
  });
}

async function deliverMessageIfRecipientsOnline(
  message: { status: string; save(): Promise<unknown> },
  conversation: { participants: { toString(): string }[] },
  senderId: string
) {
  const otherParticipants = conversation.participants.filter(
    (p) => p.toString() !== senderId.toString()
  );
  const isAnyOtherOnline = otherParticipants.some((pId) => userSocketMap[pId.toString()]);
  if (isAnyOtherOnline) {
    message.status = 'delivered';
    await message.save();
  }
}

async function sendMessageToConversation(
  req: AuthRequest,
  res: Response,
  messageData: Parameters<typeof messageService.createMessage>[0]
) {
  const { id: receiverOrGroupId } = req.params;
  const senderId = req.user!._id;

  const conversation = await messageService.resolveOrCreateConversation(
    senderId.toString(),
    receiverOrGroupId as string
  );

  if (!messageService.isParticipant(conversation, senderId.toString())) {
    return res.status(403).json({ error: "You are not a participant in this conversation" });
  }

  const newMessage = await messageService.createMessage({
    ...messageData,
    senderId,
    conversationId: conversation._id,
    status: 'sent',
  });

  await messageService.appendMessageToConversation(conversation, newMessage);
  await deliverMessageIfRecipientsOnline(newMessage, conversation, senderId.toString());

  const populatedMessage = await newMessage.populate("senderId", "name profilePic");
  emitToParticipants(conversation.participants, senderId.toString(), "newMessage", populatedMessage);

  return res.status(201).json(populatedMessage);
}

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;
    await sendMessageToConversation(req, res, { content });
  } catch (error: any) {
    console.error("Error in sendMessage controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendVoiceMessage = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const audioUrl = `/uploads/audio/${req.file.filename}`;
    await sendMessageToConversation(req, res, {
      messageType: 'voice',
      fileUrl: audioUrl,
      content: 'Voice Message',
    });
  } catch (error: any) {
    console.error("Error in sendVoiceMessage controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMediaMessage = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    let messageType: 'image' | 'video' | 'file' = 'file';
    let subDir = 'documents';

    if (req.file.mimetype.startsWith('image/')) {
      messageType = 'image';
      subDir = 'images';
    } else if (req.file.mimetype.startsWith('video/')) {
      messageType = 'video';
      subDir = 'videos';
    }

    const fileUrl = `/uploads/${subDir}/${req.file.filename}`;
    await sendMessageToConversation(req, res, {
      messageType,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      content: messageType.charAt(0).toUpperCase() + messageType.slice(1),
    });
  } catch (error: any) {
    console.error("Error in sendMediaMessage controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { id: receiverOrGroupId } = req.params;
    const senderId = req.user!._id;

    const conversation = await messageService.findConversation(
      senderId.toString(),
      receiverOrGroupId as string
    );

    if (!conversation) return res.status(200).json([]);

    const messages = await messageService.getMessagesForConversation(conversation._id.toString());

    const filteredMessages = messages.filter(
      (msg: any) =>
        !msg.isDeletedForEveryone &&
        !msg.deletedBy.some((id: any) => id.toString() === senderId.toString())
    );

    res.status(200).json(filteredMessages);
  } catch (error: any) {
    console.error("Error in getMessages controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessageForMe = async (req: AuthRequest, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user!._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    const userIdStr = userId.toString();
    if (!message.deletedBy.some((id) => id.toString() === userIdStr)) {
      message.deletedBy.push(userId as any);
      await message.save();
    }

    res.status(200).json({ message: "Message deleted for you" });
  } catch (error: any) {
    console.error("Error in deleteMessageForMe controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessageForEveryone = async (req: AuthRequest, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user!._id;

    const message = await Message.findById(messageId).populate('conversationId');
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "You can only delete your own messages for everyone" });
    }

    message.isDeletedForEveryone = true;
    message.content = "This message was deleted";
    message.fileUrl = "";
    message.messageType = "text";
    await message.save();

    const conversation = message.conversationId as any;
    emitToParticipants(
      conversation.participants,
      userId.toString(),
      "messageDeleted",
      { messageId, conversationId: conversation._id },
      true
    );

    res.status(200).json({ message: "Message deleted for everyone" });
  } catch (error: any) {
    console.error("Error in deleteMessageForEveryone controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markMessagesAsSeen = async (req: AuthRequest, res: Response) => {
  try {
    const { id: receiverOrGroupId } = req.params;
    const userId = req.user!._id;

    const conversation = await messageService.findConversation(
      userId.toString(),
      receiverOrGroupId as string
    );

    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const conversationId = conversation._id.toString();
    await messageService.markMessagesAsSeen(conversationId, userId.toString());

    const participants = conversation.participants.map((p: any) => p.toString());
    emitToParticipants(
      conversation.participants,
      userId.toString(),
      "messagesSeen",
      { conversationId, userId, participants }
    );

    res.status(200).json({ message: "Messages marked as seen" });
  } catch (error: any) {
    console.error("Error in markMessagesAsSeen controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { participants, groupName } = req.body;
    const adminId = req.user!._id;

    if (!participants || participants.length < 1) {
      return res.status(400).json({ error: "Please select at least one member" });
    }

    if (!groupName) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const allParticipants = [...new Set([...participants, adminId.toString()])];

    const conversation = await messageService.createConversation(
      allParticipants,
      true,
      groupName,
      [adminId.toString()]
    );

    const populatedConversation = await conversation.populate([
      { path: "participants", select: "name profilePic" },
      { path: "admins", select: "name profilePic" }
    ]);

    allParticipants.forEach((participantId) => {
      if (participantId !== adminId.toString()) {
        const userSockets = userSocketMap[participantId];
        if (userSockets) {
          userSockets.forEach((socketId) => {
            io.to(socketId).emit("newConversation", populatedConversation);
          });
        }
      }
    });

    res.status(201).json(populatedConversation);
  } catch (error: any) {
    console.error("Error in createGroup controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const conversations = await messageService.getConversationsForUser(userId.toString());
    res.status(200).json(conversations);
  } catch (error: any) {
    console.error("Error in getConversations controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

async function notifyGroupUpdate(conversation: any) {
  const populatedConversation = await conversation.populate([
    { path: "participants", select: "name profilePic" },
    { path: "admins", select: "name profilePic" }
  ]);

  populatedConversation.participants.forEach((participant: any) => {
    const participantId = participant._id.toString();
    const userSockets = userSocketMap[participantId];
    if (userSockets) {
      userSockets.forEach((socketId: string) => {
        io.to(socketId).emit("updateConversation", populatedConversation);
      });
    }
  });

  return populatedConversation;
}

export const leaveGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user!._id;

    const conversation = await messageService.getConversationById(conversationId as string);
    if (!conversation) return res.status(404).json({ error: "Group not found" });

    conversation.participants = conversation.participants.filter(
      (id: any) => id.toString() !== userId.toString()
    );
    conversation.admins = conversation.admins.filter(
      (id: any) => id.toString() !== userId.toString()
    );

    if (conversation.participants.length > 0 && conversation.admins.length === 0) {
      conversation.admins.push(conversation.participants[0]);
    }

    await conversation.save();
    await notifyGroupUpdate(conversation);

    res.status(200).json({ message: "Left group successfully" });
  } catch (error: any) {
    console.error("Error in leaveGroup controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const kickMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const { userId: targetUserId } = req.body;
    const adminId = req.user!._id;

    const conversation = await messageService.getConversationById(conversationId as string);
    if (!conversation) return res.status(404).json({ error: "Group not found" });

    const isAdmin = conversation.admins.some((id: any) => id.toString() === adminId.toString());
    if (!isAdmin) return res.status(403).json({ error: "Only admins can kick members" });

    const targetIsAdmin = conversation.admins.some(
      (id: any) => id.toString() === targetUserId.toString()
    );
    if (targetIsAdmin) {
      return res.status(403).json({ error: "Cannot kick an admin. Demote them to member first." });
    }

    conversation.participants = conversation.participants.filter(
      (id: any) => id.toString() !== targetUserId.toString()
    );
    await conversation.save();

    const populatedConversation = await notifyGroupUpdate(conversation);

    const kickedSockets = userSocketMap[targetUserId.toString()];
    if (kickedSockets) {
      kickedSockets.forEach((socketId: string) => {
        io.to(socketId).emit("updateConversation", populatedConversation);
      });
    }

    res.status(200).json(populatedConversation);
  } catch (error: any) {
    console.error("Error in kickMember controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const promoteToAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const { userId: targetUserId } = req.body;
    const adminId = req.user!._id;

    const conversation = await messageService.getConversationById(conversationId as string);
    if (!conversation) return res.status(404).json({ error: "Group not found" });

    const isAdmin = conversation.admins.some((id: any) => id.toString() === adminId.toString());
    if (!isAdmin) return res.status(403).json({ error: "Only admins can promote others" });

    if (!conversation.admins.some((id: any) => id.toString() === targetUserId.toString())) {
      conversation.admins.push(targetUserId);
      await conversation.save();
    }

    const populatedConversation = await notifyGroupUpdate(conversation);
    res.status(200).json(populatedConversation);
  } catch (error: any) {
    console.error("Error in promoteToAdmin controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const demoteToMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const { userId: targetUserId } = req.body;
    const adminId = req.user!._id;

    const conversation = await messageService.getConversationById(conversationId as string);
    if (!conversation) return res.status(404).json({ error: "Group not found" });

    const isAdmin = conversation.admins.some((id: any) => id.toString() === adminId.toString());
    if (!isAdmin) return res.status(403).json({ error: "Only admins can demote others" });

    if (targetUserId.toString() === adminId.toString()) {
      return res.status(400).json({ error: "You cannot demote yourself. Use leave instead." });
    }

    conversation.admins = conversation.admins.filter(
      (id: any) => id.toString() !== targetUserId.toString()
    );
    await conversation.save();

    const populatedConversation = await notifyGroupUpdate(conversation);
    res.status(200).json(populatedConversation);
  } catch (error: any) {
    console.error("Error in demoteToMember controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateGroupProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const adminId = req.user!._id;

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const conversation = await messageService.getConversationById(conversationId as string);
    if (!conversation) return res.status(404).json({ error: "Group not found" });

    const isAdmin = conversation.admins.some((id: any) => id.toString() === adminId.toString());
    if (!isAdmin) return res.status(403).json({ error: "Only admins can update group profile" });

    const fileData = fs.readFileSync(req.file.path);
    conversation.groupImage = {
      data: fileData,
      contentType: req.file.mimetype,
    };

    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error("Error deleting temp file:", err);
    }

    await conversation.save();
    const populatedConversation = await notifyGroupUpdate(conversation);
    res.status(200).json(populatedConversation);
  } catch (error: any) {
    console.error("Error in updateGroupProfile controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addMembersToGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const { participants: newUserIds } = req.body;
    const adminId = req.user!._id;

    if (!newUserIds || newUserIds.length === 0) {
      return res.status(400).json({ error: "No users selected to add" });
    }

    const conversation = await messageService.getConversationById(conversationId as string);
    if (!conversation) return res.status(404).json({ error: "Group not found" });

    const isAdmin = conversation.admins.some((id: any) => id.toString() === adminId.toString());
    if (!isAdmin) return res.status(403).json({ error: "Only admins can add members" });

    const currentParticipants = conversation.participants.map((p: any) => p.toString());
    const addedUserIds: string[] = [];
    newUserIds.forEach((uId: string) => {
      if (!currentParticipants.includes(uId)) {
        conversation.participants.push(uId as any);
        addedUserIds.push(uId);
      }
    });

    await conversation.save();

    const populatedConversation = await conversation.populate([
      { path: "participants", select: "name profilePic" },
      { path: "admins", select: "name profilePic" }
    ]);

    populatedConversation.participants.forEach((participant: any) => {
      const participantId = participant._id.toString();
      const userSockets = userSocketMap[participantId];
      if (userSockets) {
        userSockets.forEach((socketId: string) => {
          io.to(socketId).emit("updateConversation", populatedConversation);
        });
      }
    });

    addedUserIds.forEach((userId) => {
      const userSockets = userSocketMap[userId];
      if (userSockets) {
        userSockets.forEach((socketId: string) => {
          io.to(socketId).emit("newConversation", populatedConversation);
        });
      }
    });

    res.status(200).json(populatedConversation);
  } catch (error: any) {
    console.error("Error in addMembersToGroup controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
