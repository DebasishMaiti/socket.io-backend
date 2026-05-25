import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  isGroup: {
    type: Boolean,
    default: false,
  },
  groupName: {
    type: String,
    default: '',
  },
  groupImage: {
    data: Buffer,
    contentType: String,
  },
  admins: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  ],
  messages: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: [],
    },
  ],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
  }
}, { timestamps: true });

conversationSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (ret.groupImage && ret.groupImage.data) {
      const base64 = Buffer.from(ret.groupImage.data).toString('base64');
      ret.groupImage = `data:${ret.groupImage.contentType};base64,${base64}` as any;
    }
    return ret;
  }
});

conversationSchema.set('toObject', {
  transform: (doc, ret) => {
    if (ret.groupImage && ret.groupImage.data) {
      const base64 = Buffer.from(ret.groupImage.data).toString('base64');
      ret.groupImage = `data:${ret.groupImage.contentType};base64,${base64}` as any;
    }
    return ret;
  }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
