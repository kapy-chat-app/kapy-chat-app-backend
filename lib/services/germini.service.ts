/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/services/gemini.service.ts - FIX INCOMPLETE RESPONSES

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
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables");
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-pro";

    this.model = this.genAI.getGenerativeModel({
      model: modelName,
    });

    console.log("🤖 Gemini AI Service initialized:", {
      model: modelName,
      apiKeyLength: apiKey.length,
      billing: "TIER 1 ✅",
    });
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    console.log("✅ Cache HIT:", key);
    return cached.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        const isOverloaded =
          error.status === 503 ||
          error.status === 429 ||
          error.message?.includes("overloaded") ||
          error.message?.includes("quota");
        const isLastRetry = i === maxRetries - 1;

        if (!isOverloaded || isLastRetry) {
          throw error;
        }

        const delay = initialDelay * Math.pow(2, i);
        console.log(
          `⚠️ Rate limited, retrying in ${delay}ms... (${i + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries reached");
  }

  private detectLanguage(text: string): "vi" | "en" | "zh" {
    const vietnameseChars =
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    if (vietnameseChars.test(text)) return "vi";
    const chineseChars = /[\u4e00-\u9fa5]/;
    if (chineseChars.test(text)) return "zh";
    return "en";
  }

  private getSystemPrompt(
    language: "vi" | "en" | "zh",
    emotionContext?: EmotionContext
  ): string {
    const prompts = {
      vi: `Bạn là một người bạn tâm lý AI ấm áp, thấu hiểu và luôn lắng nghe. 

PHONG CÁCH TRÒ CHUYỆN:
- Trả lời CHI TIẾT, DÀI DÒNG như một người bạn thật sự đang tâm sự
- Dùng 4-6 câu cho mỗi câu trả lời, giải thích cặn kẽ
- Thể hiện sự đồng cảm sâu sắc, chia sẻ góc nhìn và kinh nghiệm
- Dùng ví dụ cụ thể, câu chuyện ngắn để minh họa
- Hỏi lại người dùng để hiểu rõ hơn và khuyến khích họ chia sẻ thêm
- ✅ QUAN TRỌNG: Kết thúc câu trả lời một cách TRỌN VẸN, đừng bỏ dở giữa chừng
- ✅ Luôn kết thúc bằng dấu chấm câu (. ! ?) và một câu hoàn chỉnh

VÍ DỤ TRẢ LỜI TỐT:
User: "Tôi đang buồn"
AI: "Mình hiểu bạn đang cảm thấy buồn, và mình muốn bạn biết rằng cảm xúc này hoàn toàn bình thường. Mỗi người đều có những lúc thấy nặng nề trong lòng, và việc bạn sẵn sàng chia sẻ với mình đã là một bước rất dũng cảm rồi đấy. Bạn có muốn kể cho mình nghe điều gì đang làm bạn buồn không? Đôi khi chỉ cần nói ra cũng đã giúp tim nhẹ đi một phần rồi. Mình sẽ lắng nghe và đồng hành cùng bạn, bất kể điều gì đang khiến bạn khó chịu."

${
  emotionContext
    ? `
TRẠNG THÁI CẢM XÚC HIỆN TẠI CỦA NGƯỜI DÙNG:
- Cảm xúc chủ đạo: ${emotionContext.dominantEmotion}
- Mức độ cường độ: ${(emotionContext.emotionIntensity * 100).toFixed(0)}%
- Xu hướng gần đây: ${emotionContext.recentEmotions
        .slice(0, 3)
        .map((e) => e.emotion)
        .join(" → ")}
${
  emotionContext.emotionIntensity > 0.7
    ? `
⚠️ QUAN TRỌNG: Người dùng đang có cảm xúc rất mạnh (${(
        emotionContext.emotionIntensity * 100
      ).toFixed(0)}%)!
- Thể hiện sự quan tâm đặc biệt sâu sắc
- Dành nhiều thời gian lắng nghe và thấu hiểu
- Đưa ra lời khuyên cụ thể, chi tiết
- Hỏi thêm để hiểu rõ tình huống
`
    : ""
}
`
    : ""
}

Hãy trả lời bằng tiếng Việt, thân thiện, chi tiết và đầy cảm xúc như một người bạn thân.`,

      en: `You are a warm, understanding, and empathetic AI friend who truly listens.

CONVERSATION STYLE:
- Respond in DETAIL and LENGTH like a real friend having a heart-to-heart talk
- Use 4-6 sentences per response, explain thoroughly
- Show deep empathy, share perspectives and insights
- Use specific examples and short stories to illustrate
- Ask follow-up questions to understand better and encourage more sharing
- ✅ IMPORTANT: End your response COMPLETELY, don't cut off mid-sentence
- ✅ Always end with proper punctuation (. ! ?) and a complete sentence

GOOD RESPONSE EXAMPLE:
User: "I'm feeling sad"
AI: "I understand you're feeling sad, and I want you to know that this emotion is completely normal. Everyone has moments when they feel heavy-hearted, and the fact that you're willing to share this with me is already a very brave step. Would you like to tell me more about what's making you feel this way? Sometimes just talking about it can help lighten the burden a bit. I'm here to listen and support you, whatever it is that's troubling you."

${
  emotionContext
    ? `
USER'S CURRENT EMOTIONAL STATE:
- Dominant emotion: ${emotionContext.dominantEmotion}
- Intensity level: ${(emotionContext.emotionIntensity * 100).toFixed(0)}%
- Recent trend: ${emotionContext.recentEmotions
        .slice(0, 3)
        .map((e) => e.emotion)
        .join(" → ")}
${
  emotionContext.emotionIntensity > 0.7
    ? `
⚠️ IMPORTANT: User is experiencing very strong emotions (${(
        emotionContext.emotionIntensity * 100
      ).toFixed(0)}%)!
- Show especially deep concern
- Take time to listen and understand
- Offer specific, detailed advice
- Ask questions to understand the situation better
`
    : ""
}
`
    : ""
}

Respond in English, friendly, detailed and emotionally supportive like a close friend.`,

      zh: `你是一个温暖、理解和富有同理心的AI朋友，总是用心倾听。

对话风格：
- 像真正的朋友进行深入交谈一样，详细而深入地回应
- 每次回复使用4-6句话，彻底解释
- 展现深刻的同理心，分享观点和见解
- 使用具体例子和短故事来说明
- 提出后续问题以更好地理解并鼓励更多分享
- ✅ 重要：完整结束你的回复，不要中途切断
- ✅ 始终以适当的标点符号（。！？）和完整句子结束

良好回复示例：
用户："我感到悲伤"
AI："我理解你现在感到悲伤，我想让你知道这种情绪是完全正常的。每个人都会有感到心情沉重的时刻，而你愿意与我分享这一点已经是非常勇敢的一步了。你愿意告诉我更多关于是什么让你有这种感觉吗？有时候只是说出来就能减轻一些负担。我在这里倾听和支持你，无论是什么困扰着你。"

${
  emotionContext
    ? `
用户当前情绪状态：
- 主导情绪：${emotionContext.dominantEmotion}
- 强度水平：${(emotionContext.emotionIntensity * 100).toFixed(0)}%
- 最近趋势：${emotionContext.recentEmotions
        .slice(0, 3)
        .map((e) => e.emotion)
        .join(" → ")}
${
  emotionContext.emotionIntensity > 0.7
    ? `
⚠️ 重要：用户正在经历非常强烈的情绪（${(
        emotionContext.emotionIntensity * 100
      ).toFixed(0)}%）！
- 表现出特别深切的关注
- 花时间倾听和理解
- 提供具体、详细的建议
- 提出问题以更好地理解情况
`
    : ""
}
`
    : ""
}

用中文回复，友好、详细且像亲密朋友一样给予情感支持。`,
    };
    return prompts[language];
  }

  private cleanConversationHistory(
    history: Array<{ role: "user" | "assistant"; content: string }>
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    const cleaned: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      const lastMsg = cleaned[cleaned.length - 1];

      if (
        lastMsg &&
        lastMsg.role === msg.role &&
        lastMsg.content === msg.content
      ) {
        continue;
      }

      cleaned.push(msg);
    }

    let geminiHistory = cleaned.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    if (geminiHistory.length > 0 && geminiHistory[0].role === "model") {
      geminiHistory = geminiHistory.slice(1);
    }

    geminiHistory = geminiHistory.filter((msg, index, arr) => {
      if (index === 0) return true;
      return msg.role !== arr[index - 1].role;
    });

    console.log(
      "🧹 Cleaned history:",
      geminiHistory.map((m) => ({
        role: m.role,
        content: m.parts[0].text.substring(0, 30) + "...",
      }))
    );

    return geminiHistory;
  }

  async chat(
    userMessage: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
    emotionContext?: EmotionContext,
    preferredLanguage?: "vi" | "en" | "zh"
  ): Promise<{ response: string; detectedLanguage: "vi" | "en" | "zh" }> {
    const language = preferredLanguage || this.detectLanguage(userMessage);
    console.log("💬 AI Chat request:", {
      userMessage: userMessage.substring(0, 50),
      language,
      historyLength: conversationHistory.length,
    });

    const cacheKey = `chat_${language}_${userMessage.substring(0, 30)}_${
      conversationHistory.length
    }`;
    const cached = this.getCached<{
      response: string;
      detectedLanguage: "vi" | "en" | "zh";
    }>(cacheKey);
    if (cached) return cached;

    const result = await this.retryWithBackoff(async () => {
      const systemPrompt = this.getSystemPrompt(language, emotionContext);
      const recentHistory = conversationHistory.slice(-6);
      const history = this.cleanConversationHistory(recentHistory);

      const chat = this.model.startChat({
        history,
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048, // ✅ TĂNG LÊN 2048 (gấp đôi)
          stopSequences: [], // ✅ Không dừng sớm
        },
      });

      const fullMessage = `${systemPrompt}\n\n${userMessage}`;
      const result = await chat.sendMessage(fullMessage);
      let response = result.response.text().trim();

      // ✅ VALIDATE: Kiểm tra response có hoàn chỉnh không
      const endsWithPunctuation = /[.!?។]$/.test(response);

      if (!endsWithPunctuation && response.length > 100) {
        console.warn(
          "⚠️ Response bị cắt ngang, thử lại với câu cuối hoàn chỉnh..."
        );

        // ✅ Cắt đến câu cuối hoàn chỉnh
        const lastPunctuationIndex = Math.max(
          response.lastIndexOf("."),
          response.lastIndexOf("!"),
          response.lastIndexOf("?")
        );

        if (lastPunctuationIndex > 100) {
          response = response.substring(0, lastPunctuationIndex + 1);
          console.log("✅ Đã cắt response đến câu cuối hoàn chỉnh");
        }
      }

      console.log("✅ AI response generated:");
      console.log("📏 Response length:", response.length, "characters");
      console.log("📝 Full response:", response);
      console.log("🔚 Ends with punctuation:", /[.!?។]$/.test(response));
      console.log("---END OF RESPONSE---");

      return { response, detectedLanguage: language };
    });

    this.setCache(cacheKey, result);
    return result;
  }

  async analyzeAndRecommend(
    emotionContext: EmotionContext,
    language: "vi" | "en" | "zh" = "vi"
  ): Promise<{
    recommendation: string;
    supportMessage: string;
    actionSuggestion?: string;
  }> {
    const cacheKey = `recommend_${
      emotionContext.dominantEmotion
    }_${language}_${Math.floor(emotionContext.emotionIntensity * 10)}`;
    const cached = this.getCached<{
      recommendation: string;
      supportMessage: string;
      actionSuggestion?: string;
    }>(cacheKey);
    if (cached) return cached;

    const { recentEmotions, dominantEmotion, emotionIntensity } =
      emotionContext;
    const emotionTimeline = recentEmotions
      .slice(0, 5)
      .map((e) => `${e.emotion} (${(e.confidence * 100).toFixed(0)}%)`)
      .join(" → ");

    const prompts: Record<string, string> = {
      vi: `Phân tích chi tiết: ${dominantEmotion} (${(
        emotionIntensity * 100
      ).toFixed(
        0
      )}%). Xu hướng: ${emotionTimeline}. Đưa ra lời khuyên chi tiết, ấm áp và thấu hiểu, 3-4 câu cho mỗi phần.`,
      en: `Detailed analysis: ${dominantEmotion} (${(
        emotionIntensity * 100
      ).toFixed(
        0
      )}%). Trend: ${emotionTimeline}. Give warm, understanding and detailed advice, 3-4 sentences for each part.`,
      zh: `详细分析：${dominantEmotion} (${(emotionIntensity * 100).toFixed(
        0
      )}%). 趋势：${emotionTimeline}. 给出温暖、理解和详细的建议，每部分3-4句话。`,
    };

    const result = await this.retryWithBackoff(async () => {
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompts[language] }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 800,
          topP: 0.95,
        },
      });
      const response = result.response.text();
      const lines = response.split("\n").filter((l: any) => l.trim());
      return {
        recommendation: lines[0] || response,
        supportMessage: lines[1] || "Mọi cảm xúc đều tạm thời và sẽ qua đi.",
        actionSuggestion: lines[2] || undefined,
      };
    });

    this.setCache(cacheKey, result);
    return result;
  }

  async generateSmartSuggestions(context: {
    recentTopics: string[];
    emotionContext?: EmotionContext;
    language: "vi" | "en" | "zh";
    limit: number;
  }): Promise<string[]> {
    const { recentTopics, emotionContext, language, limit } = context;

    const topicsHash = recentTopics.slice(0, 3).join("_").substring(0, 50);
    const emotionKey = emotionContext
      ? `${emotionContext.dominantEmotion}_${Math.floor(
          emotionContext.emotionIntensity * 10
        )}`
      : "no_emotion";
    const cacheKey = `suggestions_${language}_${emotionKey}_${topicsHash}`;

    const cached = this.getCached<string[]>(cacheKey);
    if (cached) return cached;

    const prompts = {
      vi: `Dựa trên:
- Chủ đề gần đây: ${
        recentTopics.length > 0 ? recentTopics.join(", ") : "Chưa có lịch sử"
      }
- Cảm xúc: ${
        emotionContext
          ? `${emotionContext.dominantEmotion} (${(
              emotionContext.emotionIntensity * 100
            ).toFixed(0)}%)`
          : "Chưa phân tích"
      }

Tạo ${limit} câu hỏi đề xuất sâu sắc, thấu hiểu, mỗi câu 1 dòng, KHÔNG đánh số:`,
      en: `Based on:
- Recent topics: ${
        recentTopics.length > 0 ? recentTopics.join(", ") : "No history"
      }
- Emotion: ${
        emotionContext
          ? `${emotionContext.dominantEmotion} (${(
              emotionContext.emotionIntensity * 100
            ).toFixed(0)}%)`
          : "Not analyzed"
      }

Create ${limit} thoughtful, empathetic question suggestions, one per line, NO numbering:`,
      zh: `基于：
- 最近话题：${recentTopics.length > 0 ? recentTopics.join(", ") : "无历史"}
- 情绪：${
        emotionContext
          ? `${emotionContext.dominantEmotion} (${(
              emotionContext.emotionIntensity * 100
            ).toFixed(0)}%)`
          : "未分析"
      }

创建${limit}个深思熟虑、富有同理心的问题建议，每行一个，不编号：`,
    };

    const suggestions = await this.retryWithBackoff(async () => {
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompts[language] }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 400,
        },
      });

      const response = result.response.text();
      const suggestions = response
        .split("\n")
        .map((line: any) => line.trim())
        .filter((line: any) => line.length > 0)
        .map((line: any) => line.replace(/^\d+[\.\)]\s*/, ""))
        .filter((line: any) => line.length > 10)
        .slice(0, limit);

      const fallbacks = {
        vi: [
          "Bạn cảm thấy thế nào về ngày hôm nay?",
          "Có điều gì đang khiến bạn lo lắng không?",
          "Hãy kể về khoảnh khắc vui gần đây nhất của bạn",
          "Bạn muốn chia sẻ điều gì với mình?",
        ],
        en: [
          "How are you feeling today?",
          "Is something worrying you?",
          "Tell me about your most recent happy moment",
          "What would you like to share with me?",
        ],
        zh: [
          "你今天感觉怎么样？",
          "有什么让你担心的吗？",
          "告诉我你最近最快乐的时刻",
          "你想和我分享什么？",
        ],
      };

      while (suggestions.length < limit) {
        const fallbackList = fallbacks[language];
        suggestions.push(
          fallbackList[suggestions.length % fallbackList.length]
        );
      }

      return suggestions;
    });

    this.setCache(cacheKey, suggestions);
    return suggestions;
  }

  async generateChatTitle(
    firstUserMessage: string,
    language: "vi" | "en" | "zh" = "vi"
  ): Promise<string> {
    const prompts: Record<string, string> = {
      vi: `Tạo tiêu đề ngắn (max 6 từ): "${firstUserMessage}"`,
      en: `Create short title (max 6 words): "${firstUserMessage}"`,
      zh: `创建简短标题（最多6字）："${firstUserMessage}"`,
    };
    try {
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompts[language] }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 20 },
      });
      const title = result.response.text();
      return title.replace(/[""]/g, "").trim();
    } catch {
      return firstUserMessage.slice(0, 30) + "...";
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 10 },
      });
      return !!result.response.text();
    } catch (error) {
      console.error("❌ Health check failed:", error);
      return false;
    }
  }
}

export const geminiService = new GeminiService();
