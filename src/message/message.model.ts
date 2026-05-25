import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  content: {
    type: String,
    required: function() { return this.messageType === 'text'; },
  },
  messageType: {
    type: String,
    enum: ['text', 'voice', 'image', 'video', 'file'],
    default: 'text',
  },
  fileUrl: {
    type: String,
    required: function() { 
      return ['voice', 'image', 'video', 'file'].includes(this.messageType); 
    },
  },
  fileName: {
    type: String,
  },
  fileSize: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'seen'],
    default: 'sent',
  },
  deletedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  isDeletedForEveryone: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// For backward compatibility with older 'audioUrl' field if any
messageSchema.virtual('audioUrl').get(function() {
  return this.fileUrl;
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
