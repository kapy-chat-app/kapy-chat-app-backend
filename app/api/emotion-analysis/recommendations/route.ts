// app/api/emotion-analysis/recommendations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { geminiService } from "@/lib/services/germini.service";

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await User.findOne({ clerkId: userId });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const language = (searchParams.get("language") || "vi") as "vi" | "en" | "zh";
    const days = parseInt(searchParams.get("days") || "7", 10);

    // ============================================
    // COLLECT EMOTION DATA
    // ============================================
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get recent emotions
    const recentEmotions = await EmotionAnalysis.find({
      user: user._id,
      analyzed_at: { $gte: startDate },
    })
      .sort({ analyzed_at: -1 })
      .limit(20)
      .select("dominant_emotion confidence_score emotion_scores analyzed_at")
      .lean();

    if (recentEmotions.length === 0) {
      const defaultRecommendations = getDefaultRecommendations(language);
      return NextResponse.json({
        success: true,
        data: {
          hasData: false,
          recommendations: defaultRecommendations,
          currentEmotion: "neutral",
          emotionIntensity: 0,
        },
      });
    }

    // ============================================
    // ANALYZE EMOTION PATTERNS
    // ============================================

    // Calculate average emotion scores
    const emotionScoresSum = {
      joy: 0,
      sadness: 0,
      anger: 0,
      fear: 0,
      surprise: 0,
      neutral: 0,
    };

    recentEmotions.forEach((emotion) => {
      Object.entries(emotion.emotion_scores).forEach(([key, value]) => {
        emotionScoresSum[key as keyof typeof emotionScoresSum] += value as number;
      });
    });

    const count = recentEmotions.length;
    const averageScores = Object.fromEntries(
      Object.entries(emotionScoresSum).map(([key, sum]) => [key, sum / count])
    ) as typeof emotionScoresSum;

    // Find dominant emotion from average
    const dominantEmotion = Object.entries(averageScores).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];

    // Calculate emotion intensity (how strong the dominant emotion is)
    const emotionIntensity = averageScores[dominantEmotion as keyof typeof averageScores];

    // Count emotion frequency
    const emotionCounts: Record<string, number> = {};
    recentEmotions.forEach((emotion) => {
      emotionCounts[emotion.dominant_emotion] =
        (emotionCounts[emotion.dominant_emotion] || 0) + 1;
    });

    // Check for concerning patterns
    const negativeEmotions = ["sadness", "anger", "fear"];
    const negativeCount = negativeEmotions.reduce(
      (sum, emotion) => sum + (emotionCounts[emotion] || 0),
      0
    );
    const negativeRatio = negativeCount / count;

    // Most recent emotion (for acute situations)
    const latestEmotion = recentEmotions[0];
    const isAcuteSituation =
      latestEmotion.confidence_score > 0.7 &&
      negativeEmotions.includes(latestEmotion.dominant_emotion);

    // ============================================
    // GENERATE AI RECOMMENDATION
    // ============================================

    const emotionContext = {
      recentEmotions: recentEmotions.map((e) => ({
        emotion: e.dominant_emotion,
        confidence: e.confidence_score,
        timestamp: e.analyzed_at,
      })),
      dominantEmotion,
      emotionIntensity,
      negativeRatio,
      isAcuteSituation,
      emotionCounts,
      averageScores,
    };

    console.log("🎯 Emotion Context for AI:", {
      dominantEmotion,
      emotionIntensity: (emotionIntensity * 100).toFixed(0) + "%",
      negativeRatio: (negativeRatio * 100).toFixed(0) + "%",
      isAcuteSituation,
      recentCount: recentEmotions.length,
    });

    try {
      const aiRecommendation = await geminiService.analyzeAndRecommend(
        emotionContext,
        language
      );

      // ✅ BUILD RECOMMENDATIONS ARRAY
      const recommendations = [
        aiRecommendation.recommendation,
        aiRecommendation.supportMessage,
        aiRecommendation.actionSuggestion,
      ].filter(Boolean); // Remove undefined/null values

      return NextResponse.json({
        success: true,
        data: {
          hasData: true,
          recommendations, // ✅ Array instead of individual fields
          currentEmotion: dominantEmotion,
          emotionIntensity,
          negativeRatio,
          isAcuteSituation,
          emotionCounts,
          averageScores,
          analysisDate: new Date().toISOString(),
        },
      });
    } catch (aiError) {
      console.error("❌ AI recommendation failed:", aiError);

      // Fallback to rule-based recommendation
      const fallbackRecommendations = getFallbackRecommendations(
        dominantEmotion,
        emotionIntensity,
        negativeRatio,
        language
      );

      return NextResponse.json({
        success: true,
        data: {
          hasData: true,
          recommendations: fallbackRecommendations, // ✅ Array
          currentEmotion: dominantEmotion,
          emotionIntensity,
          negativeRatio,
          isAcuteSituation,
          emotionCounts,
          averageScores,
          analysisDate: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("❌ Error getting emotion recommendations:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get recommendations",
      },
      { status: 500 }
    );
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDefaultRecommendations(language: "vi" | "en" | "zh"): string[] {
  const recommendations = {
    vi: [
      "Chào mừng bạn đến với hệ thống phân tích cảm xúc!",
      "Hãy bắt đầu ghi nhận cảm xúc của bạn để nhận được những lời khuyên phù hợp.",
      "Mỗi cảm xúc đều quan trọng và xứng đáng được lắng nghe.",
    ],
    en: [
      "Welcome to the emotion analysis system!",
      "Start recording your emotions to receive personalized advice.",
      "Every emotion is important and deserves to be heard.",
    ],
    zh: [
      "欢迎来到情绪分析系统！",
      "开始记录您的情绪以获得个性化建议。",
      "每一种情绪都很重要，都值得被倾听。",
    ],
  };
  return recommendations[language];
}

function getFallbackRecommendations(
  emotion: string,
  intensity: number,
  negativeRatio: number,
  language: "vi" | "en" | "zh"
): string[] {
  const recommendations: Record<
    string,
    Record<string, string[]>
  > = {
    vi: {
      joy: [
        "Bạn đang trong trạng thái cảm xúc tích cực! Đây là thời điểm tuyệt vời để kết nối với người thân và chia sẻ niềm vui.",
        "Hãy tận hưởng những khoảnh khắc hạnh phúc này và ghi nhận những điều tốt đẹp trong cuộc sống.",
        "Viết nhật ký biết ơn hoặc chia sẻ niềm vui với một người bạn thân.",
      ],
      sadness: [
        intensity > 0.6
          ? "Tôi nhận thấy bạn đang trải qua giai đoạn khó khăn. Hãy nhớ rằng cảm xúc này sẽ qua đi và bạn không đơn độc."
          : "Cảm giác buồn là một phần tự nhiên của cuộc sống. Hãy cho phép bản thân được cảm nhận và chữa lành.",
        "Đôi khi, chỉ cần cho phép bản thân khóc và nghỉ ngơi cũng đã là một hành động dũng cảm.",
        "Hãy nói chuyện với người thân hoặc tìm kiếm sự hỗ trợ chuyên nghiệp nếu cần.",
      ],
      anger: [
        intensity > 0.6
          ? "Bạn đang cảm thấy rất tức giận. Hãy tạm dừng, hít thở sâu và tìm cách xả stress an toàn."
          : "Cảm giác tức giận cho thấy ranh giới của bạn đang bị xâm phạm. Hãy xác định nguyên nhân và giải quyết một cách khéo léo.",
        "Giận dữ là cảm xúc hợp lệ, nhưng cách bạn thể hiện nó mới quan trọng.",
        "Thử vận động thể chất, viết ra cảm xúc hoặc thực hành thiền định.",
      ],
      fear: [
        "Nỗi sợ hãi có thể là dấu hiệu bảo vệ, nhưng đừng để nó chi phối cuộc sống. Hãy đối mặt từng bước nhỏ.",
        "Bạn mạnh mẽ hơn những gì bạn nghĩ. Mỗi bước nhỏ đều là tiến bộ.",
        "Chia nhỏ những lo lắng thành các vấn đề cụ thể và giải quyết từng cái một.",
      ],
      neutral: [
        "Trạng thái cân bằng cảm xúc là một điều tốt! Đây là lúc thích hợp để lập kế hoạch và phát triển bản thân.",
        "Sự ổn định cảm xúc là nền tảng cho sức khỏe tinh thần tốt.",
        "Duy trì thói quen tốt và đặt mục tiêu mới cho bản thân.",
      ],
    },
    en: {
      joy: [
        "You're in a positive emotional state! This is a great time to connect with loved ones and share your joy.",
        "Enjoy these happy moments and acknowledge the good things in your life.",
        "Write in a gratitude journal or share your joy with a friend.",
      ],
      sadness: [
        intensity > 0.6
          ? "I notice you're going through a difficult period. Remember that this feeling will pass and you're not alone."
          : "Feeling sad is a natural part of life. Allow yourself to feel and heal.",
        "Sometimes, just allowing yourself to cry and rest is already an act of courage.",
        "Talk to loved ones or seek professional support if needed.",
      ],
      anger: [
        intensity > 0.6
          ? "You're feeling very angry. Pause, take deep breaths, and find safe ways to release stress."
          : "Anger shows your boundaries are being crossed. Identify the cause and address it skillfully.",
        "Anger is a valid emotion, but how you express it matters.",
        "Try physical exercise, write down your feelings, or practice meditation.",
      ],
      fear: [
        "Fear can be protective, but don't let it control your life. Face it one small step at a time.",
        "You're stronger than you think. Every small step is progress.",
        "Break down worries into specific issues and tackle them one by one.",
      ],
      neutral: [
        "Emotional balance is a good thing! This is a great time to plan and develop yourself.",
        "Emotional stability is the foundation for good mental health.",
        "Maintain good habits and set new goals for yourself.",
      ],
    },
    zh: {
      joy: [
        "您处于积极的情绪状态！这是与亲人联系和分享快乐的好时机。",
        "享受这些快乐的时刻，并感恩生活中美好的事物。",
        "写感恩日记或与朋友分享您的快乐。",
      ],
      sadness: [
        intensity > 0.6
          ? "我注意到您正在经历困难时期。请记住这种感觉会过去，您并不孤单。"
          : "悲伤是生活的自然组成部分。允许自己感受和疗愈。",
        "有时候，允许自己哭泣和休息本身就是一种勇敢的行为。",
        "与亲人交谈或在需要时寻求专业支持。",
      ],
      anger: [
        intensity > 0.6
          ? "您感到非常愤怒。暂停一下，深呼吸，找到安全的方式释放压力。"
          : "愤怒表明您的界限被侵犯了。找出原因并巧妙地解决。",
        "愤怒是有效的情绪，但表达方式很重要。",
        "尝试体育锻炼、写下感受或练习冥想。",
      ],
      fear: [
        "恐惧可以起保护作用，但不要让它控制您的生活。一步一步地面对它。",
        "您比自己想象的更强大。每一小步都是进步。",
        "将担忧分解为具体问题，逐一解决。",
      ],
      neutral: [
        "情绪平衡是好事！这是规划和发展自己的好时机。",
        "情绪稳定是良好心理健康的基础。",
        "保持良好习惯，为自己设定新目标。",
      ],
    },
  };

  const emotionKey = emotion in recommendations[language] ? emotion : "neutral";
  const recs = [...recommendations[language][emotionKey]];

  // Add warning for high negative ratio
  if (negativeRatio > 0.6) {
    const warningMessages = {
      vi: "⚠️ Bạn đang trải qua nhiều cảm xúc tiêu cực. Hãy cân nhắc tìm kiếm sự hỗ trợ chuyên nghiệp hoặc nói chuyện với người thân.",
      en: "⚠️ You're experiencing many negative emotions. Consider seeking professional support or talking to loved ones.",
      zh: "⚠️ 您正在经历许多负面情绪。考虑寻求专业支持或与亲人交谈。",
    };
    recs.push(warningMessages[language]);
  }

  return recs;
}