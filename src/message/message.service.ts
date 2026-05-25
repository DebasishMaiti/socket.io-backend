import Conversation from '../conversation/conversation.model';
import Message from './message.model';

export const getConversationByParticipants = async (participants: string[]) => {
  return await Conversation.findOne({
    participants: { $all: participants, $size: participants.length },
    isGroup: false,
  });
};

export const getConversationById = async (id: string) => {
  return await Conversation.findById(id);
};

export const createConversation = async (participants: string[], isGroup = false, groupName = '', admins: string[] = []) => {
  return await Conversation.create({
    participants,
    isGroup,
    groupName,
    admins,
  });
};

export const createMessage = async (messageData: any) => {
  const newMessage = new Message(messageData);
  return await newMessage.save();
};

export const markMessagesAsSeen = async (conversationId: string, userId: string) => {
  return await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, status: { $ne: 'seen' } },
    { $set: { status: 'seen' } }
  );
};

export const getMessagesForConversation = async (conversationId: string) => {
  const conversation = await Conversation.findById(conversationId).populate({
    path: "messages",
    populate: {
      path: "senderId",
      select: "name profilePic"
    }
  });

  return conversation ? conversation.messages : [];
};

export const getConversationsForUser = async (userId: string) => {
  return await Conversation.find({
    participants: userId
  })
  .populate("participants", "name profilePic")
  .populate("lastMessage")
  .sort({ updatedAt: -1 });
};

export const findConversation = async (senderId: string, receiverOrGroupId: string) => {
  let conversation = await getConversationById(receiverOrGroupId);
  if (!conversation) {
    conversation = await getConversationByParticipants([
      senderId.toString(),
      receiverOrGroupId,
    ]);
  }
  return conversation;
};

export const resolveOrCreateConversation = async (
  senderId: string,
  receiverOrGroupId: string
) => {
  let conversation = await findConversation(senderId, receiverOrGroupId);
  if (!conversation) {
    conversation = await createConversation([
      senderId.toString(),
      receiverOrGroupId,
    ]);
  }
  return conversation;
};

export const isParticipant = (conversation: { participants: { toString(): string }[] }, userId: string) =>
  conversation.participants.some((p) => p.toString() === userId.toString());

export const appendMessageToConversation = async (
  conversation: { messages: unknown[]; lastMessage?: unknown; save(): Promise<unknown> },
  message: { _id: unknown }
) => {
  conversation.messages.push(message._id);
  conversation.lastMessage = message._id;
  await conversation.save();
};
