// lib/ai-advisor/emotion-counselor.ts

import { geminiService } from "../services/germini.service";

interface EmotionContext {
  currentEmotion: string;
  confidence: number;
  recentEmotions: string[]; // Last 3-5 emotions
  callDuration: number; // seconds
  isPrivateCall: boolean;
  transcription?: string; // Audio transcription from Groq
}

/**
 * ⭐ Generate real-time emotion advice using Gemini
 */
export async function generateEmotionAdvice(
  context: EmotionContext
): Promise<string> {
  const {
    currentEmotion,
    confidence,
    recentEmotions,
    callDuration,
    isPrivateCall,
    transcription,
  } = context;

  // Skip advice for neutral emotions with high confidence
  if (currentEmotion === "neutral" && confidence > 0.8) {
    return "";
  }

  const emotionTrend =
    recentEmotions.length > 0 ? recentEmotions.join(" → ") : currentEmotion;

  const callMinutes = Math.floor(callDuration / 60);
  const callSeconds = callDuration % 60;

  // Detect language from transcription or default to Vietnamese
  const language = transcription ? detectLanguage(transcription) : "vi";

  const prompts = {
    vi: `Bạn là chuyên gia tư vấn cảm xúc trong cuộc gọi video.

**Tình huống hiện tại:**
- Cảm xúc hiện tại: ${currentEmotion} (${(confidence * 100).toFixed(
      0
    )}% chắc chắn)
- Xu hướng cảm xúc gần đây: ${emotionTrend}
- Thời gian gọi: ${callMinutes}p ${callSeconds}s
- Loại cuộc gọi: ${isPrivateCall ? "Riêng tư 1-1" : "Nhóm"}
${transcription ? `- Nội dung vừa nói: "${transcription}"` : ""}

**Nhiệm vụ:**
Đưa ra 1-2 câu tư vấn ngắn gọn (tối đa 80 từ) để giúp người dùng quản lý cảm xúc trong cuộc gọi này.

**Nguyên tắc:**
- Ấm áp, không phán xét, khích lệ
- Tập trung vào hành động thực tế ngay lập tức
- Xem xét ngữ cảnh cuộc gọi (riêng tư hay nhóm)
- Nếu cảm xúc tích cực (vui, ngạc nhiên): khen ngợi và khuyến khích tiếp tục
- Nếu cảm xúc tiêu cực (giận, buồn, sợ): đưa ra chiến lược làm dịu
- Nếu có transcription, phản hồi phù hợp với nội dung

**Trả về:**
CHỈ trả lời nội dung tư vấn, không có nhãn hay tiền tố.`,

    en: `You are an emotion counseling expert for video calls.

**Current Situation:**
- Current emotion: ${currentEmotion} (${(confidence * 100).toFixed(
      0
    )}% confidence)
- Recent emotion trend: ${emotionTrend}
- Call duration: ${callMinutes}m ${callSeconds}s
- Call type: ${isPrivateCall ? "Private 1-on-1" : "Group call"}
${transcription ? `- Just said: "${transcription}"` : ""}

**Task:**
Provide 1-2 brief sentences (max 80 words) to help the user manage emotions during this call.

**Guidelines:**
- Warm, non-judgmental, encouraging
- Focus on immediate practical actions
- Consider call context (private vs group)
- If positive emotion (joy, surprise): praise and encourage
- If negative emotion (anger, sadness, fear): provide calming strategies
- If transcription exists, respond appropriately to content

**Return:**
ONLY the advice text, no labels or prefixes.`,

    zh: `您是视频通话的情绪咨询专家。

**当前情况：**
- 当前情绪：${currentEmotion}（${(confidence * 100).toFixed(0)}% 信心）
- 最近情绪趋势：${emotionTrend}
- 通话时长：${callMinutes}分 ${callSeconds}秒
- 通话类型：${isPrivateCall ? "私人1对1" : "群组通话"}
${transcription ? `- 刚才说的："${transcription}"` : ""}

**任务：**
提供1-2句简短建议（最多80字）帮助用户在通话中管理情绪。

**指导原则：**
- 温暖、不评判、鼓励
- 专注于立即可行的行动
- 考虑通话场景（私人或群组）
- 如果是积极情绪（快乐、惊讶）：赞美并鼓励
- 如果是消极情绪（愤怒、悲伤、恐惧）：提供平静策略
- 如果有转录，适当回应内容

**返回：**
仅返回建议文本，无标签或前缀。`,
  };

  try {
    const prompt = prompts[language];

    const result = await geminiService.model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 150,
      },
    });

    const advice = result.response.text().trim();

    console.log(`🤖 [Gemini] Generated advice for ${currentEmotion}:`, advice);

    return advice;
  } catch (error) {
    console.error("❌ Failed to generate emotion advice:", error);

    // Fallback advice
    return getFallbackAdvice(currentEmotion, language);
  }
}

/**
 * ⭐ Detect language from text
 */
function detectLanguage(text: string): "vi" | "en" | "zh" {
  const vietnameseChars =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (vietnameseChars.test(text)) return "vi";

  const chineseChars = /[\u4e00-\u9fa5]/;
  if (chineseChars.test(text)) return "zh";

  return "en";
}

/**
 * ⭐ Fallback advice when AI is unavailable
 */
function getFallbackAdvice(
  emotion: string,
  language: "vi" | "en" | "zh"
): string {
  const fallbacks: Record<string, Record<string, string>> = {
    anger: {
      vi: "Hãy hít thở sâu. Tạm dừng trước khi phản hồi. Nếu cần, hãy xin phép tạm nghỉ một chút.",
      en: "Take a deep breath. Pause before responding. Consider stepping away for a moment if needed.",
      zh: "深呼吸。在回应前暂停。如果需要，可以考虑暂时离开一下。",
    },
    sadness: {
      vi: "Cảm thấy như vậy là bình thường. Hãy dành thời gian cho bản thân, bạn không đơn độc đâu.",
      en: "It's okay to feel this way. Take your time, and remember you're not alone.",
      zh: "有这种感觉很正常。慢慢来，记住你并不孤单。",
    },
    fear: {
      vi: "Hãy tập trung vào hơi thở để bình tĩnh lại. Bạn đang an toàn trong thời điểm này.",
      en: "Ground yourself by focusing on your breathing. You're safe in this moment.",
      zh: "通过专注呼吸来稳定自己。此刻你是安全的。",
    },
    joy: {
      vi: "Hãy tận hưởng khoảnh khắc tích cực này! Niềm vui của bạn có thể lan tỏa đến người khác.",
      en: "Embrace this positive moment! Your happiness can be contagious.",
      zh: "拥抱这个积极的时刻！你的快乐会感染他人。",
    },
    surprise: {
      vi: "Hãy dành chút thời gian để tiếp nhận điều bạn đang trải qua. Ngạc nhiên là điều tự nhiên.",
      en: "Take a moment to process what you're experiencing. It's natural to feel surprised.",
      zh: "花点时间处理你正在经历的事情。感到惊讶是很自然的。",
    },
    neutral: {
      vi: "Bạn có vẻ bình tĩnh và cân bằng. Đây là trạng thái tốt để giao tiếp rõ ràng.",
      en: "You seem calm and balanced right now. That's a good state for clear communication.",
      zh: "你现在看起来平静而平衡。这是清晰沟通的良好状态。",
    },
  };

  return fallbacks[emotion]?.[language] || fallbacks["neutral"][language];
}

/**
 * ⭐ Check if advice should be sent (rate limiting)
 */
export function shouldSendAdvice(
  lastAdviceTime: Date | null,
  cooldownSeconds: number = 30
): boolean {
  if (!lastAdviceTime) return true;

  const timeSince = (Date.now() - lastAdviceTime.getTime()) / 1000;
  return timeSince >= cooldownSeconds;
}
