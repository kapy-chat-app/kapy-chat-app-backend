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
    emotionContext: any,
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

    const { recentEmotions, dominantEmotion, emotionIntensity, negativeRatio } =
      emotionContext;

    const emotionTimeline = recentEmotions
      .slice(0, 5)
      .map((e: any) => `${e.emotion} (${(e.confidence * 100).toFixed(0)}%)`)
      .join(" → ");

    // ✅ SIMPLIFIED PROMPT - Shorter and clearer
    const prompts: Record<string, string> = {
      vi: `Phân tích cảm xúc: ${dominantEmotion} (${(
        emotionIntensity * 100
      ).toFixed(0)}%)

Viết 3 câu ngắn (mỗi câu 15-20 từ):

1. PHÂN TÍCH: [Nhận xét về cảm xúc hiện tại]
2. ĐỘNG VIÊN: [Lời động viên ấm áp]  
3. HÀNH ĐỘNG: [Gợi ý hành động cụ thể]

Chỉ viết 3 câu, mỗi dòng một câu, kết thúc bằng dấu chấm.`,

      en: `Emotion analysis: ${dominantEmotion} (${(
        emotionIntensity * 100
      ).toFixed(0)}%)

Write 3 short sentences (15-20 words each):

1. ANALYSIS: [Comment on current emotion]
2. ENCOURAGEMENT: [Warm encouragement]
3. ACTION: [Specific action suggestion]

Only 3 sentences, one per line, end with period.`,

      zh: `情绪分析：${dominantEmotion} (${(emotionIntensity * 100).toFixed(
        0
      )}%)

写3个简短句子（每句15-20字）：

1. 分析：[对当前情绪的评论]
2. 鼓励：[温暖的鼓励]
3. 行动：[具体的行动建议]

只写3句话，每行一句，以句号结束。`,
    };

    const result = await this.retryWithBackoff(async () => {
      console.log("🤖 Calling Gemini for emotion recommendations...");

      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompts[language] }] }],
        generationConfig: {
          temperature: 0.6, // ✅ Lower for consistency
          maxOutputTokens: 512, // ✅ Sufficient for 3 short sentences
          topP: 0.85,
          topK: 40,
          stopSequences: [], // ✅ No early stopping
        },
        // ✅ ADD SAFETY SETTINGS to prevent blocking
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_NONE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE",
          },
        ],
      });

      const response = result.response.text().trim();
      console.log("🤖 Gemini raw response:", response);
      console.log("🤖 Response length:", response.length);

      // ✅ SIMPLE LINE-BASED PARSING
      const lines = response
        .split("\n")
        .map((l:string) => l.trim())
        // Remove numbering and labels
        .map((l:string) =>
          l
            .replace(/^\d+\.\s*/, "")
            .replace(
              /^(PHÂN TÍCH|ĐỘNG VIÊN|HÀNH ĐỘNG|ANALYSIS|ENCOURAGEMENT|ACTION|分析|鼓励|行动)[:：]\s*/i,
              ""
            )
            .replace(/^\[.*?\]\s*/, "")
        )
        .filter((l:string) => l.length > 10);

      console.log("🤖 Parsed lines:", lines);

      let recommendation = lines[0] || "";
      let supportMessage = lines[1] || "";
      let actionSuggestion = lines[2] || "";

      // ✅ ENSURE COMPLETE SENTENCES
      const ensureComplete = (text: string): string => {
        if (!text) return text;
        text = text.trim();

        // If incomplete (doesn't end with punctuation), try to salvage
        if (!/[.!?។]$/.test(text)) {
          const lastPunct = Math.max(
            text.lastIndexOf("."),
            text.lastIndexOf("!"),
            text.lastIndexOf("?")
          );

          if (lastPunct > 15) {
            text = text.substring(0, lastPunct + 1);
          } else if (text.length > 15) {
            text += ".";
          } else {
            return ""; // Too short, will use fallback
          }
        }

        return text;
      };

      recommendation = ensureComplete(recommendation);
      supportMessage = ensureComplete(supportMessage);
      actionSuggestion = ensureComplete(actionSuggestion);

      // ✅ USE FALLBACKS if any field is empty
      if (!recommendation) {
        recommendation = getFallbackRecommendation(
          dominantEmotion,
          language,
          "recommendation"
        );
        console.log("⚠️ Using fallback recommendation");
      }
      if (!supportMessage) {
        supportMessage = getFallbackRecommendation(
          dominantEmotion,
          language,
          "support"
        );
        console.log("⚠️ Using fallback support");
      }
      if (!actionSuggestion) {
        actionSuggestion = getFallbackRecommendation(
          dominantEmotion,
          language,
          "action"
        );
        console.log("⚠️ Using fallback action");
      }

      console.log("✅ Final parsed recommendations:");
      console.log("  - Recommendation:", recommendation);
      console.log("  - Support:", supportMessage);
      console.log("  - Action:", actionSuggestion);

      return {
        recommendation,
        supportMessage,
        actionSuggestion,
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
      vi: `Bạn là trợ lý AI tâm lý. Dựa trên:
- Chủ đề người dùng đã hỏi gần đây: ${
        recentTopics.length > 0 ? recentTopics.join(", ") : "Chưa có lịch sử"
      }
- Cảm xúc hiện tại của người dùng: ${
        emotionContext
          ? `${emotionContext.dominantEmotion} (${(
              emotionContext.emotionIntensity * 100
            ).toFixed(0)}%)`
          : "Chưa phân tích"
      }

Hãy tạo ${limit} câu hỏi mà NGƯỜI DÙNG có thể hỏi AI để:
- Tiếp tục cuộc trò chuyện một cách tự nhiên
- Khám phá sâu hơn về cảm xúc hoặc vấn đề của họ
- Nhận được lời khuyên hoặc hỗ trợ phù hợp

YÊU CẦU:
- Mỗi câu hỏi là một câu hoàn chỉnh mà người dùng sẽ GỬI cho AI
- KHÔNG đánh số, KHÔNG dùng dấu gạch đầu dòng
- Mỗi câu một dòng
- Câu hỏi phải tự nhiên, thân thiện như người dùng đang nhắn tin

VÍ DỤ ĐÚNG:
Làm sao để tôi cải thiện tâm trạng?
Tôi nên làm gì khi cảm thấy căng thẳng?
Bạn có thể giúp tôi hiểu rõ hơn về cảm xúc này không?

VÍ DỤ SAI (KHÔNG làm như này):
1. Bạn đang cảm thấy thế nào?
- Có điều gì khiến bạn lo lắng không?`,

      en: `You are a mental health AI assistant. Based on:
- User's recent topics: ${
        recentTopics.length > 0 ? recentTopics.join(", ") : "No history"
      }
- User's current emotion: ${
        emotionContext
          ? `${emotionContext.dominantEmotion} (${(
              emotionContext.emotionIntensity * 100
            ).toFixed(0)}%)`
          : "Not analyzed"
      }

Create ${limit} questions that the USER can ask the AI to:
- Continue the conversation naturally
- Explore their emotions or issues more deeply
- Get appropriate advice or support

REQUIREMENTS:
- Each question is a complete sentence the user will SEND to the AI
- NO numbering, NO bullet points
- One question per line
- Questions should be natural and friendly like the user is texting

CORRECT EXAMPLES:
How can I improve my mood?
What should I do when I feel stressed?
Can you help me understand this emotion better?

WRONG EXAMPLES (DON'T do this):
1. How are you feeling?
- Is something worrying you?`,

      zh: `你是一个心理健康AI助手。基于：
- 用户最近的话题：${
        recentTopics.length > 0 ? recentTopics.join(", ") : "无历史"
      }
- 用户当前情绪：${
        emotionContext
          ? `${emotionContext.dominantEmotion} (${(
              emotionContext.emotionIntensity * 100
            ).toFixed(0)}%)`
          : "未分析"
      }

创建${limit}个用户可以问AI的问题，以便：
- 自然地继续对话
- 更深入地探索他们的情绪或问题
- 获得适当的建议或支持

要求：
- 每个问题是用户将发送给AI的完整句子
- 不编号，不使用项目符号
- 每行一个问题
- 问题应自然友好，像用户在发短信

正确示例：
我该如何改善心情？
感到压力时应该做什么？
你能帮我更好地理解这种情绪吗？

错误示例（不要这样做）：
1. 你感觉怎么样？
- 有什么让你担心的吗？`,
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
        // ✅ Loại bỏ số thứ tự và dấu gạch đầu dòng
        .map((line: any) =>
          line.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•]\s*/, "")
        )
        .filter((line: any) => line.length > 10)
        .slice(0, limit);

      // Fallback suggestions nếu AI không trả về đủ
      const fallbacks = {
        vi: [
          "Làm sao để tôi cải thiện tâm trạng của mình?",
          "Bạn có thể cho tôi lời khuyên về việc quản lý stress không?",
          "Tôi nên làm gì khi cảm thấy lo lắng?",
          "Có cách nào để tôi cảm thấy tích cực hơn không?",
        ],
        en: [
          "How can I improve my mood?",
          "Can you give me advice on managing stress?",
          "What should I do when I feel anxious?",
          "Is there a way for me to feel more positive?",
        ],
        zh: [
          "我该如何改善心情？",
          "你能给我管理压力的建议吗？",
          "当我感到焦虑时应该做什么？",
          "有什么方法可以让我更积极吗？",
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

  /**
   * ⭐ Generate simple text from prompt
   */
  public async generateText(
    prompt: string,
    config?: {
      temperature?: number;
      topP?: number;
      maxOutputTokens?: number;
    }
  ): Promise<string> {
    const result = await this.retryWithBackoff(async () => {
      const response = await this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: config,
      });

      return response.response.text().trim();
    });

    return result;
  }
}

// Helper function for fallback recommendations
function getFallbackRecommendation(
  emotion: string,
  language: "vi" | "en" | "zh",
  type: "recommendation" | "support" | "action"
): string {
  const fallbacks: Record<string, Record<string, Record<string, string>>> = {
    vi: {
      joy: {
        recommendation:
          "Bạn đang trong trạng thái cảm xúc tích cực, đây là thời điểm tuyệt vời để kết nối với người thân.",
        support:
          "Hãy tận hưởng những khoảnh khắc hạnh phúc này và ghi nhận những điều tốt đẹp trong cuộc sống.",
        action:
          "Viết nhật ký biết ơn hoặc chia sẻ niềm vui với một người bạn thân.",
      },
      sadness: {
        recommendation:
          "Cảm giác buồn là một phần tự nhiên của cuộc sống, hãy cho phép bản thân được cảm nhận và chữa lành.",
        support:
          "Đôi khi, chỉ cần cho phép bản thân khóc và nghỉ ngơi cũng đã là một hành động dũng cảm.",
        action:
          "Hãy nói chuyện với người thân hoặc tìm kiếm sự hỗ trợ chuyên nghiệp nếu cần.",
      },
      anger: {
        recommendation:
          "Cảm giác tức giận cho thấy ranh giới của bạn đang bị xâm phạm, hãy xác định nguyên nhân.",
        support:
          "Giận dữ là cảm xúc hợp lệ, nhưng cách bạn thể hiện nó mới quan trọng.",
        action:
          "Thử vận động thể chất, viết ra cảm xúc hoặc thực hành thiền định.",
      },
      fear: {
        recommendation:
          "Nỗi sợ hãi có thể là dấu hiệu bảo vệ, nhưng đừng để nó chi phối cuộc sống.",
        support:
          "Bạn mạnh mẽ hơn những gì bạn nghĩ, mỗi bước nhỏ đều là tiến bộ.",
        action:
          "Chia nhỏ những lo lắng thành các vấn đề cụ thể và giải quyết từng cái một.",
      },
      neutral: {
        recommendation:
          "Trạng thái cân bằng cảm xúc là một điều tốt, đây là lúc thích hợp để lập kế hoạch.",
        support: "Sự ổn định cảm xúc là nền tảng cho sức khỏe tinh thần tốt.",
        action: "Duy trì thói quen tốt và đặt mục tiêu mới cho bản thân.",
      },
    },
    en: {
      joy: {
        recommendation:
          "You're in a positive emotional state, this is a great time to connect with loved ones.",
        support:
          "Enjoy these happy moments and acknowledge the good things in your life.",
        action: "Write in a gratitude journal or share your joy with a friend.",
      },
      sadness: {
        recommendation:
          "Feeling sad is a natural part of life, allow yourself to feel and heal.",
        support:
          "Sometimes, just allowing yourself to cry and rest is already an act of courage.",
        action: "Talk to loved ones or seek professional support if needed.",
      },
      anger: {
        recommendation:
          "Anger shows your boundaries are being crossed, identify the cause.",
        support: "Anger is a valid emotion, but how you express it matters.",
        action:
          "Try physical exercise, write down your feelings, or practice meditation.",
      },
      fear: {
        recommendation:
          "Fear can be protective, but don't let it control your life.",
        support:
          "You're stronger than you think, every small step is progress.",
        action:
          "Break down worries into specific issues and tackle them one by one.",
      },
      neutral: {
        recommendation:
          "Emotional balance is a good thing, this is a great time to plan.",
        support:
          "Emotional stability is the foundation for good mental health.",
        action: "Maintain good habits and set new goals for yourself.",
      },
    },
    zh: {
      joy: {
        recommendation: "您处于积极的情绪状态，这是与亲人联系的好时机。",
        support: "享受这些快乐的时刻，并感恩生活中美好的事物。",
        action: "写感恩日记或与朋友分享您的快乐。",
      },
      sadness: {
        recommendation: "悲伤是生活的自然组成部分，允许自己感受和疗愈。",
        support: "有时候，允许自己哭泣和休息本身就是一种勇敢的行为。",
        action: "与亲人交谈或在需要时寻求专业支持。",
      },
      anger: {
        recommendation: "愤怒表明您的界限被侵犯了，找出原因。",
        support: "愤怒是有效的情绪，但表达方式很重要。",
        action: "尝试体育锻炼、写下感受或练习冥想。",
      },
      fear: {
        recommendation: "恐惧可以起保护作用，但不要让它控制您的生活。",
        support: "您比自己想象的更强大，每一小步都是进步。",
        action: "将担忧分解为具体问题，逐一解决。",
      },
      neutral: {
        recommendation: "情绪平衡是好事，这是规划的好时机。",
        support: "情绪稳定是良好心理健康的基础。",
        action: "保持良好习惯，为自己设定新目标。",
      },
    },
  };

  const emotionKey = emotion in fallbacks[language] ? emotion : "neutral";
  return fallbacks[language][emotionKey][type];
}

export const geminiService = new GeminiService();
