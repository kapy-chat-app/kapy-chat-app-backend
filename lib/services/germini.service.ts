/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/services/gemini.service.ts - Google AI Studio (FREE - No billing)

import { GoogleGenerativeAI } from "@google/generative-ai";

interface EmotionContext {
  recentEmotions: Array<{
    emotion: string;
    confidence: number;
    timestamp: Date;
  }>;
  dominantEmotion: string;
  emotionIntensity: number;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    
    this.model = this.genAI.getGenerativeModel({ 
      model: modelName
    });
    
    console.log('🤖 Gemini AI Studio Service initialized:', {
      model: modelName,
      apiKeyLength: apiKey.length,
      billing: 'NOT REQUIRED ✅'
    });
  }

  // ✅ Retry logic with exponential backoff
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        const isOverloaded = error.status === 503 || error.message?.includes('overloaded');
        const isLastRetry = i === maxRetries - 1;
        
        if (!isOverloaded || isLastRetry) {
          throw error;
        }
        
        const delay = initialDelay * Math.pow(2, i);
        console.log(`⚠️ Model overloaded, retrying in ${delay}ms... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries reached');
  }

  private detectLanguage(text: string): 'vi' | 'en' | 'zh' {
    const vietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    if (vietnameseChars.test(text)) return 'vi';
    const chineseChars = /[\u4e00-\u9fa5]/;
    if (chineseChars.test(text)) return 'zh';
    return 'en';
  }

  private getSystemPrompt(language: 'vi' | 'en' | 'zh', emotionContext?: EmotionContext): string {
    const prompts = {
      vi: `Bạn là một trợ lý tâm lý AI thông minh và đầy empathy. Nhiệm vụ của bạn là:
- Lắng nghe và thấu hiểu cảm xúc của người dùng
- Đưa ra lời khuyên thiết thực và tích cực
- Trò chuyện tự nhiên, thân thiện như một người bạn
- Trả lời ngắn gọn (2-4 câu) trừ khi được yêu cầu chi tiết
${emotionContext ? `
TRẠNG THÁI CẢM XÚC HIỆN TẠI:
- Cảm xúc chủ đạo: ${emotionContext.dominantEmotion}
- Cường độ: ${(emotionContext.emotionIntensity * 100).toFixed(0)}%
- Xu hướng gần đây: ${emotionContext.recentEmotions.slice(0, 3).map(e => e.emotion).join(' → ')}
${emotionContext.emotionIntensity > 0.7 ? '⚠️ Cảm xúc đang rất mạnh, cần đặc biệt chú ý!' : ''}
` : ''}
Hãy trả lời bằng tiếng Việt.`,
      en: `You are an intelligent and empathetic AI psychology assistant. Your mission:
- Listen and understand the user's emotions
- Provide practical and positive advice
- Chat naturally and friendly like a friend
- Keep responses concise (2-4 sentences) unless asked for details
${emotionContext ? `
CURRENT EMOTIONAL STATE:
- Dominant emotion: ${emotionContext.dominantEmotion}
- Intensity: ${(emotionContext.emotionIntensity * 100).toFixed(0)}%
- Recent trend: ${emotionContext.recentEmotions.slice(0, 3).map(e => e.emotion).join(' → ')}
${emotionContext.emotionIntensity > 0.7 ? '⚠️ Emotions are very intense, special attention needed!' : ''}
` : ''}
Respond in English.`,
      zh: `你是一个聪明且富有同理心的心理AI助手。你的任务是：
- 倾听并理解用户的情绪
- 提供实用和积极的建议
- 像朋友一样自然友好地聊天
- 保持简洁回复（2-4句话），除非被要求详细说明
${emotionContext ? `
当前情绪状态：
- 主导情绪：${emotionContext.dominantEmotion}
- 强度：${(emotionContext.emotionIntensity * 100).toFixed(0)}%
- 最近趋势：${emotionContext.recentEmotions.slice(0, 3).map(e => e.emotion).join(' → ')}
${emotionContext.emotionIntensity > 0.7 ? '⚠️ 情绪非常强烈，需要特别关注！' : ''}
` : ''}
请用中文回复。`
    };
    return prompts[language];
  }

  async chat(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    emotionContext?: EmotionContext,
    preferredLanguage?: 'vi' | 'en' | 'zh'
  ): Promise<{ response: string; detectedLanguage: 'vi' | 'en' | 'zh' }> {
    const language = preferredLanguage || this.detectLanguage(userMessage);
    console.log('💬 AI Studio Chat request:', { userMessage, language });

    return this.retryWithBackoff(async () => {
      const systemPrompt = this.getSystemPrompt(language, emotionContext);
      const recentHistory = conversationHistory.slice(-6);
      
      // ✅ Ensure history starts with 'user' role
      let history = recentHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      // Remove first message if it's from model
      if (history.length > 0 && history[0].role === 'model') {
        history = history.slice(1);
      }

      // Remove consecutive messages with same role
      history = history.filter((msg, index, arr) => {
        if (index === 0) return true;
        return msg.role !== arr[index - 1].role;
      });

      const chat = this.model.startChat({
        history,
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 500,
        },
      });

      const fullMessage = `${systemPrompt}\n\n${userMessage}`;
      const result = await chat.sendMessage(fullMessage);
      const response = result.response.text();

      console.log('✅ AI Studio response generated');
      return { response: response.trim(), detectedLanguage: language };
    });
  }

  async analyzeAndRecommend(
    emotionContext: EmotionContext,
    language: 'vi' | 'en' | 'zh' = 'vi'
  ): Promise<{ recommendation: string; supportMessage: string; actionSuggestion?: string; }> {
    const { recentEmotions, dominantEmotion, emotionIntensity } = emotionContext;
    const emotionTimeline = recentEmotions.slice(0, 5).map(e => `${e.emotion} (${(e.confidence * 100).toFixed(0)}%)`).join(' → ');

    const prompts: Record<string, string> = {
      vi: `Phân tích: ${dominantEmotion} (${(emotionIntensity * 100).toFixed(0)}%). Xu hướng: ${emotionTimeline}. Đưa ra 3 điểm ngắn gọn.`,
      en: `Analyze: ${dominantEmotion} (${(emotionIntensity * 100).toFixed(0)}%). Trend: ${emotionTimeline}. Give 3 brief points.`,
      zh: `分析：${dominantEmotion} (${(emotionIntensity * 100).toFixed(0)}%). 趋势：${emotionTimeline}. 给出3个简要点。`
    };

    return this.retryWithBackoff(async () => {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompts[language] }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
      });
      const response = result.response.text();
      const lines = response.split('\n').filter((l: any) => l.trim());
      return {
        recommendation: lines[0] || response,
        supportMessage: lines[1] || "All emotions are temporary.",
        actionSuggestion: lines[2] || undefined
      };
    });
  }

  async generateChatTitle(firstUserMessage: string, language: 'vi' | 'en' | 'zh' = 'vi'): Promise<string> {
    const prompts: Record<string, string> = {
      vi: `Tạo tiêu đề ngắn (max 6 từ): "${firstUserMessage}"`,
      en: `Create short title (max 6 words): "${firstUserMessage}"`,
      zh: `创建简短标题（最多6字）："${firstUserMessage}"`
    };
    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompts[language] }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 20 },
      });
      const title = result.response.text();
      return title.replace(/[""]/g, '').trim();
    } catch {
      return firstUserMessage.slice(0, 30) + '...';
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 10 },
      });
      return !!result.response.text();
    } catch (error) {
      console.error('❌ Health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const geminiService = new GeminiService();