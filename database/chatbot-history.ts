import mongoose, { Document, model, models, Schema } from "mongoose";

const ChatHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conversation_id: { type: String, required: true },
  messages: [{
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    emotion_detected: { type: String },
  }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const ChatHistory = mongoose.models.ChatHistory || 
  mongoose.model('ChatHistory', ChatHistorySchema);


export default ChatHistory;