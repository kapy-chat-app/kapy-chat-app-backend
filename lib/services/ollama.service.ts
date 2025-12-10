/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/ollama.service.ts - WITH DEBUG LOGS

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

interface EmotionContext {
  recentEmotions: Array<{
    emotion: string;
    confidence: number;
    timestamp: Date;
  }>;
  dominantEmotion: string;
  emotionIntensity: number;
}

export class OllamaService {
  private ollamaUrl: string;
  private model: string;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
    
    console.log('🤖 Ollama Service initialized:', {
      url: this.ollamaUrl,
      model: this.model
    });
  }

  /**
   * Gọi Ollama API với debug logs
   */
  private async callOllama(
    prompt: string,
    systemPrompt?: string,
    temperature: number = 0.7
  ): Promise<string> {
    try {
      const fullPrompt = systemPrompt 
        ? `${systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`
        : prompt;

      console.log('📤 Calling Ollama with prompt:', {
        promptLength: fullPrompt.length,
        temperature,
        model: this.model,
        promptPreview: fullPrompt.substring(0, 200) + '...'
      });

      const requestBody = {
        model: this.model,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature,
          top_p: 0.9,
          num_predict: 500,
          stop: ['User:', 'Human:']
        }
      };

      console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Ollama API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data: OllamaGenerateResponse = await response.json();
      
      console.log('📥 Ollama response:', {
        responseLength: data.response.length,
        responsePreview: data.response.substring(0, 200),
        duration: data.total_duration,
        model: data.model
      });

      return data.response.trim();
    } catch (error) {
      console.error('❌ Ollama call failed:', error);
      throw error;
    }
  }

  /**
   * Phát hiện ngôn ngữ
   */
  private detectLanguage(text: string): 'vi' | 'en' | 'zh' {
    const vietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    if (vietnameseChars.test(text)) return 'vi';
    
    const chineseChars = /[\u4e00-\u9fa5]/;
    if (chineseChars.test(text)) return 'zh';
    
    return 'en';
  }

  /**
   * Tạo system prompt theo ngôn ngữ
   */
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

  /**
   * Chat với AI (đa ngôn ngữ) - FIXED VERSION
   */
  async chat(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    emotionContext?: EmotionContext,
    preferredLanguage?: 'vi' | 'en' | 'zh'
  ): Promise<{ response: string; detectedLanguage: 'vi' | 'en' | 'zh' }> {
    try {
      // Auto-detect language nếu không được chỉ định
      const language = preferredLanguage || this.detectLanguage(userMessage);
      
      console.log('💬 Chat request:', {
        userMessage,
        language,
        historyLength: conversationHistory.length,
        hasEmotionContext: !!emotionContext
      });

      const systemPrompt = this.getSystemPrompt(language, emotionContext);

      // ✅ FIX: Build conversation context properly
      const recentHistory = conversationHistory.slice(-6); // Chỉ lấy 6 tin nhắn gần nhất
      
      let conversationText = '';
      if (recentHistory.length > 0) {
        conversationText = recentHistory
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n');
        conversationText += '\n\n';
      }

      // ✅ FIX: Combine properly
      const fullPrompt = `${conversationText}User: ${userMessage}`;

      console.log('🔧 Built prompt:', {
        systemPromptLength: systemPrompt.length,
        conversationLength: conversationText.length,
        fullPromptLength: fullPrompt.length
      });

      const response = await this.callOllama(fullPrompt, systemPrompt, 0.7);

      console.log('✅ Chat response generated:', {
        responseLength: response.length,
        language
      });

      return {
        response,
        detectedLanguage: language
      };
    } catch (error) {
      console.error('❌ Chat error:', error);
      throw error;
    }
  }

  /**
   * Phân tích cảm xúc và đưa ra gợi ý
   */
  async analyzeAndRecommend(
    emotionContext: EmotionContext,
    language: 'vi' | 'en' | 'zh' = 'vi'
  ): Promise<{
    recommendation: string;
    supportMessage: string;
    actionSuggestion?: string;
  }> {
    const { recentEmotions, dominantEmotion, emotionIntensity } = emotionContext;

    const emotionTimeline = recentEmotions
      .slice(0, 5)
      .map(e => `${e.emotion} (${(e.confidence * 100).toFixed(0)}%)`)
      .join(' → ');

    const prompts: Record<string, string> = {
      vi: `Phân tích trạng thái cảm xúc và đưa ra lời khuyên:

CẢM XÚC HIỆN TẠI: ${dominantEmotion} (cường độ: ${(emotionIntensity * 100).toFixed(0)}%)
XU HƯỚNG GẦN ĐÂY: ${emotionTimeline}
${emotionIntensity > 0.7 ? '⚠️ Cảm xúc rất mạnh!' : ''}

Hãy đưa ra 3 điều (mỗi điều 1-2 câu):
1. Nhận xét về trạng thái cảm xúc
2. Lời khuyên để cải thiện
3. ${emotionIntensity > 0.7 ? 'Hành động cụ thể nên làm NGAY' : 'Cách duy trì trạng thái tốt'}

Trả lời bằng tiếng Việt, ngắn gọn.`,

      en: `Analyze emotional state and provide advice:

CURRENT EMOTION: ${dominantEmotion} (intensity: ${(emotionIntensity * 100).toFixed(0)}%)
RECENT TREND: ${emotionTimeline}
${emotionIntensity > 0.7 ? '⚠️ Very intense emotions!' : ''}

Provide 3 things (1-2 sentences each):
1. Observation about emotional state
2. Advice to improve
3. ${emotionIntensity > 0.7 ? 'Specific action to take NOW' : 'How to maintain good state'}

Respond in English, concisely.`,

      zh: `分析情绪状态并提供建议：

当前情绪：${dominantEmotion}（强度：${(emotionIntensity * 100).toFixed(0)}%）
最近趋势：${emotionTimeline}
${emotionIntensity > 0.7 ? '⚠️ 情绪非常强烈！' : ''}

请提供3点（每点1-2句话）：
1. 对情绪状态的观察
2. 改善建议
3. ${emotionIntensity > 0.7 ? '应该立即采取的具体行动' : '如何保持良好状态'}

用中文简洁回复。`
    };

    const response = await this.callOllama(prompts[language], '', 0.7);
    
    // Parse response
    const lines = response.split('\n').filter(l => l.trim());
    
    return {
      recommendation: lines[0] || response,
      supportMessage: lines[1] || "Remember, all emotions are temporary.",
      actionSuggestion: lines[2] || undefined
    };
  }

  /**
   * Tạo tiêu đề tự động
   */
  async generateChatTitle(firstUserMessage: string, language: 'vi' | 'en' | 'zh' = 'vi'): Promise<string> {
    const prompts: Record<string, string> = {
      vi: `Tạo một tiêu đề ngắn gọn (tối đa 6 từ) cho cuộc trò chuyện bắt đầu với: "${firstUserMessage}"\n\nChỉ trả về tiêu đề, không giải thích.`,
      en: `Create a concise title (max 6 words) for a conversation starting with: "${firstUserMessage}"\n\nReturn only the title, no explanation.`,
      zh: `为开始于"${firstUserMessage}"的对话创建一个简洁的标题（最多6个字）\n\n只返回标题，不要解释。`
    };

    try {
      const title = await this.callOllama(prompts[language], '', 0.5);
      return title.replace(/[""]/g, '').trim();
    } catch {
      return firstUserMessage.slice(0, 30) + '...';
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const ollamaService = new OllamaService();