// src/lib/ai-service.ts
interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

interface EmotionContext {
  recentEmotions: Array<{
    emotion: string;
    confidence: number;
    timestamp: Date;
  }>;
  dominantEmotion: string;
  emotionIntensity: number; // 0-1
}

export class AIService {
  private ollamaUrl: string;
  private model: string;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  }

  /**
   * Gọi Ollama API
   */
  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 200,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data: OllamaResponse = await response.json();
      return data.response.trim();
    } catch (error) {
      console.error('❌ Ollama call failed:', error);
      throw error;
    }
  }

  /**
   * Phân tích cảm xúc và đưa ra gợi ý
   */
  async analyzeAndRecommend(context: EmotionContext): Promise<{
    recommendation: string;
    supportMessage: string;
    actionSuggestion?: string;
  }> {
    const { recentEmotions, dominantEmotion, emotionIntensity } = context;

    // Tạo emotion timeline
    const emotionTimeline = recentEmotions
      .slice(0, 5)
      .map(e => `${e.emotion} (${(e.confidence * 100).toFixed(0)}%)`)
      .join(' → ');

    const prompt = `Bạn là chuyên gia tâm lý học AI. Phân tích trạng thái cảm xúc sau và đưa ra lời khuyên ngắn gọn (2-3 câu):

Cảm xúc hiện tại: ${dominantEmotion} (cường độ: ${(emotionIntensity * 100).toFixed(0)}%)
Xu hướng gần đây: ${emotionTimeline}

${emotionIntensity > 0.7 ? '⚠️ Cảm xúc đang rất mạnh!' : ''}

Đưa ra:
1. Nhận xét ngắn gọn về trạng thái cảm xúc
2. Một lời khuyên thực tế để cải thiện tâm trạng
3. ${emotionIntensity > 0.7 ? 'Hành động cụ thể nên làm ngay' : 'Gợi ý duy trì trạng thái tích cực'}

Trả lời bằng tiếng Việt, ngắn gọn, thân thiện.`;

    const aiResponse = await this.callOllama(prompt);

    // Parse response (simple splitting)
    const lines = aiResponse.split('\n').filter(l => l.trim());
    
    return {
      recommendation: lines[0] || aiResponse,
      supportMessage: lines[1] || "Hãy nhớ rằng mọi cảm xúc đều tạm thời.",
      actionSuggestion: lines[2] || undefined
    };
  }

  /**
   * Trò chuyện tư vấn cảm xúc
   */
  async chatWithUser(
    userMessage: string,
    emotionContext: EmotionContext,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    // Build context
    const emotionSummary = `[Cảm xúc hiện tại: ${emotionContext.dominantEmotion}, Cường độ: ${(emotionContext.emotionIntensity * 100).toFixed(0)}%]`;
    
    const historyText = conversationHistory
      .slice(-5) // Chỉ lấy 5 tin nhắn gần nhất
      .map(msg => `${msg.role === 'user' ? 'Người dùng' : 'AI'}: ${msg.content}`)
      .join('\n');

    const prompt = `Bạn là trợ lý tâm lý AI thân thiện, empathy. Đang trò chuyện với người dùng có trạng thái cảm xúc:

${emotionSummary}

Lịch sử chat gần đây:
${historyText}

Tin nhắn mới từ người dùng:
"${userMessage}"

Hãy trả lời một cách:
- Thấu hiểu và đồng cảm với cảm xúc hiện tại
- Ngắn gọn (2-4 câu)
- Khuyến khích tích cực nhưng không phủ nhận cảm xúc tiêu cực
- Bằng tiếng Việt

Trả lời:`;

    return await this.callOllama(prompt);
  }

  /**
   * Kiểm tra Ollama có sẵn không
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const aiService = new AIService();