/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/services/huggingface.service.ts - FINAL VERSION WITH FULL FALLBACKS
import { HfInference } from '@huggingface/inference';

// Khởi tạo với hoặc không có API key
const hf = process.env.HUGGINGFACE_API_KEY 
  ? new HfInference(process.env.HUGGINGFACE_API_KEY)
  : new HfInference();

export interface EmotionResult {
  emotion: string;
  score: number;
  allScores: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    neutral: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class HuggingFaceService {
  // ============================================
  // EMOTION ANALYSIS (với fallback)
  // ============================================
  static async analyzeEmotion(text: string): Promise<EmotionResult> {
    try {
      // Thử sử dụng Hugging Face API
      const result = await hf.textClassification({
        model: 'j-hartmann/emotion-english-distilroberta-base',
        inputs: text,
      });

      // Map emotions
      const emotionMap: Record<string, number> = {
        joy: 0,
        sadness: 0,
        anger: 0,
        fear: 0,
        surprise: 0,
        neutral: 0,
      };

      let dominantEmotion = 'neutral';
      let maxScore = 0;

      result.forEach((item: any) => {
        const emotion = item.label.toLowerCase();
        const score = item.score;

        if (emotionMap.hasOwnProperty(emotion)) {
          emotionMap[emotion] = score;
        }

        if (score > maxScore) {
          maxScore = score;
          dominantEmotion = emotion;
        }
      });

      console.log('✅ HF API emotion analysis successful');
      return {
        emotion: dominantEmotion,
        score: maxScore,
        allScores: emotionMap as any,
      };
    } catch (error: any) {
      console.error('HF Inference API error:', error.message);
      console.log('🔄 Falling back to rule-based emotion detection');
      
      // Fallback: Rule-based emotion analysis
      return this.analyzeEmotionRuleBased(text);
    }
  }

  // ============================================
  // RULE-BASED EMOTION ANALYSIS (Always works)
  // ============================================
  private static analyzeEmotionRuleBased(text: string): EmotionResult {
    const lowerText = text.toLowerCase();
    
    // Keywords cho từng emotion
    const emotionKeywords = {
      joy: ['happy', 'great', 'wonderful', 'love', 'excited', 'joy', 'amazing', 'fantastic', 'good', 'awesome', 'excellent', 'perfect', 'delighted', '😊', '😄', '🥰', '❤️', '🎉'],
      sadness: ['sad', 'depressed', 'unhappy', 'lonely', 'miss', 'cry', 'hurt', 'pain', 'sorrow', 'grief', 'disappointed', 'miserable', '😢', '😔', '💔', '😭'],
      anger: ['angry', 'mad', 'furious', 'hate', 'annoyed', 'frustrated', 'irritated', 'pissed', 'rage', 'outraged', '😠', '😡', '🤬', '💢'],
      fear: ['scared', 'afraid', 'worry', 'anxious', 'nervous', 'panic', 'terrified', 'frightened', 'concerned', 'stressed', '😨', '😰', '😱', '😟'],
      surprise: ['surprised', 'shocked', 'amazed', 'unexpected', 'wow', 'omg', 'astonished', 'stunned', '😮', '😲', '🤯', '😳'],
      neutral: ['ok', 'fine', 'maybe', 'perhaps', 'normal', 'usual', 'alright', 'okay']
    };

    const scores: Record<string, number> = {
      joy: 0,
      sadness: 0,
      anger: 0,
      fear: 0,
      surprise: 0,
      neutral: 0.3, // Base neutral score
    };

    // Count keyword matches with weighted scoring
    Object.entries(emotionKeywords).forEach(([emotion, keywords]) => {
      keywords.forEach(keyword => {
        if (lowerText.includes(keyword)) {
          // More weight for exact word matches
          const isExactWord = new RegExp(`\\b${keyword}\\b`, 'i').test(text);
          scores[emotion] += isExactWord ? 0.25 : 0.15;
        }
      });
    });

    // Check for negations (not happy = not joy)
    const negations = ['not', 'no', "n't", 'never'];
    negations.forEach(neg => {
      if (lowerText.includes(neg)) {
        // Reduce positive emotion scores if negation present
        scores.joy *= 0.5;
      }
    });

    // Normalize scores
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (total > 0) {
      Object.keys(scores).forEach(emotion => {
        scores[emotion] = scores[emotion] / total;
      });
    }

    // Find dominant emotion
    const dominantEntry = Object.entries(scores).reduce((max, [emotion, score]) => 
      score > max[1] ? [emotion, score] : max
    );

    console.log(`✅ Rule-based analysis: ${dominantEntry[0]} (${(dominantEntry[1] * 100).toFixed(0)}%)`);

    return {
      emotion: dominantEntry[0],
      score: dominantEntry[1],
      allScores: scores as any,
    };
  }

  // ============================================
  // AUDIO EMOTION ANALYSIS
  // ============================================
  static async analyzeAudioEmotion(audioBuffer: Buffer): Promise<EmotionResult> {
    try {
      // Convert audio to text first
      const transcription = await hf.automaticSpeechRecognition({
        model: 'openai/whisper-base',
        data: audioBuffer,
      });

      const text = transcription.text;
      return await this.analyzeEmotion(text);
    } catch (error) {
      console.error('Error analyzing audio emotion:', error);
      // Return neutral if audio analysis fails
      return {
        emotion: 'neutral',
        score: 0.5,
        allScores: {
          joy: 0.1,
          sadness: 0.1,
          anger: 0.1,
          fear: 0.1,
          surprise: 0.1,
          neutral: 0.5,
        },
      };
    }
  }

  // ============================================
  // AI CHATBOT (with multiple fallbacks)
  // ============================================
  static async getChatResponse(
  messages: ChatMessage[],
  userEmotionData?: any
): Promise<string> {
  const lastMessage = messages[messages.length - 1]?.content || '';
  
  try {
    // Các models đáng tin cậy hơn
    const models = [
      'meta-llama/Llama-3.2-3B-Instruct',  // Llama 3.2 - rất tốt
      'mistralai/Mistral-7B-Instruct-v0.3', // Mistral - ổn định
      'HuggingFaceH4/zephyr-7b-beta',      // Zephyr - lightweight
      'google/flan-t5-large',               // T5 - backup tốt
    ];

    for (const model of models) {
      try {
        console.log(`🤖 Trying model: ${model}`);
        
        const response = await hf.chatCompletion({
          model,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          max_tokens: 150,
          temperature: 0.7,
        });

        const content = response.choices[0]?.message?.content;
        
        if (content && content.trim()) {
          console.log(`✅ Success with ${model}`);
          return content.trim();
        }
      } catch (modelError: any) {
        console.log(`⚠️ ${model} failed: ${modelError.message}`);
        continue;
      }
    }

    console.log('🔄 All HF models failed, using template response');
    return this.getTemplateResponse(lastMessage, userEmotionData);
    
  } catch (error) {
    console.error('Error getting chat response:', error);
    return this.getTemplateResponse(lastMessage, userEmotionData);
  }
}

  // ============================================
  // BUILD CHAT PROMPT
  // ============================================
  private static buildChatPrompt(messages: ChatMessage[], emotionData?: any): string {
    const systemPrompt = this.buildSystemPrompt(emotionData);
    const conversation = messages
      .slice(-5) // Last 5 messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
    
    return `${systemPrompt}\n\n${conversation}\nAssistant:`;
  }

  // ============================================
  // SYSTEM PROMPT
  // ============================================
  private static buildSystemPrompt(userEmotionData?: any): string {
    let prompt = `You are an empathetic AI assistant specialized in emotional wellness and mental health support. Your role is to:
- Listen actively and validate emotions
- Provide supportive and non-judgmental responses
- Suggest practical coping strategies
- Encourage healthy emotional expression
- Recognize when professional help may be needed`;

    if (userEmotionData) {
      const { dominant_emotion, emotion_trends, mood_patterns } = userEmotionData;

      prompt += `\n\nCurrent User Context:
- Recent dominant emotion: ${dominant_emotion || 'unknown'}`;

      if (emotion_trends) {
        prompt += `\n- Emotion trends: ${JSON.stringify(emotion_trends)}`;
      }

      if (mood_patterns) {
        prompt += `\n- Mood patterns: ${JSON.stringify(mood_patterns)}`;
      }

      prompt += `\n\nUse this context to provide personalized and relevant support.`;
    }

    return prompt;
  }

  // ============================================
  // TEMPLATE-BASED CHAT RESPONSES (Always works)
  // ============================================
  private static getTemplateResponse(userMessage: string, emotionData?: any): string {
    const lowerMessage = userMessage.toLowerCase();
    
    // Greetings
    if (lowerMessage.match(/^(hi|hello|hey|greetings|good morning|good afternoon)/i)) {
      return "Hello! I'm here to support your emotional wellbeing. How are you feeling today? Feel free to share what's on your mind.";
    }

    // Stress/Anxiety
    if (lowerMessage.includes('stress') || lowerMessage.includes('anxious') || lowerMessage.includes('worry')) {
      return "I understand you're feeling stressed. Here are some things that might help:\n\n• Take deep breaths using the 4-7-8 technique\n• Try a short walk or light stretching\n• Write down your worries to organize your thoughts\n• Break large tasks into smaller, manageable steps\n\nRemember, it's okay to take breaks. What's causing the most stress right now?";
    }
    
    // Sadness
    if (lowerMessage.includes('sad') || lowerMessage.includes('down') || lowerMessage.includes('depressed')) {
      return "I'm sorry you're feeling down. It's important to acknowledge these feelings. Here are some suggestions:\n\n• Reach out to a friend or loved one\n• Do something small that usually brings you joy\n• Get some sunlight or fresh air if possible\n• Be kind to yourself - you're doing your best\n\nWould you like to talk about what's making you feel this way?";
    }
    
    // Anger
    if (lowerMessage.includes('angry') || lowerMessage.includes('mad') || lowerMessage.includes('frustrated')) {
      return "I can sense your frustration. It's natural to feel angry sometimes. Here's what might help:\n\n• Take a moment to pause and breathe deeply\n• Physical activity can help release tension\n• Express your feelings through journaling\n• Step away from the situation temporarily\n\nWhat triggered these feelings?";
    }

    // Fear/Panic
    if (lowerMessage.includes('scared') || lowerMessage.includes('afraid') || lowerMessage.includes('panic')) {
      return "I hear that you're feeling fearful. That's a valid emotion. Try these grounding techniques:\n\n• 5-4-3-2-1 method: Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste\n• Focus on your breathing - breathe in for 4, hold for 4, out for 4\n• Remind yourself that this feeling is temporary\n• Talk to someone you trust\n\nWould you like to explore what's causing this fear?";
    }

    // Loneliness
    if (lowerMessage.includes('lonely') || lowerMessage.includes('alone') || lowerMessage.includes('isolated')) {
      return "Feeling lonely can be really difficult. Here are some ways to help:\n\n• Reach out to a friend or family member\n• Join an online community with shared interests\n• Consider volunteering in your community\n• Practice self-compassion\n\nRemember, you're not alone in feeling this way. Many people experience loneliness.";
    }

    // Sleep issues
    if (lowerMessage.includes('sleep') || lowerMessage.includes('insomnia') || lowerMessage.includes('tired')) {
      return "Sleep problems can really affect our wellbeing. Here are some tips:\n\n• Establish a consistent sleep schedule\n• Avoid screens 1 hour before bed\n• Create a relaxing bedtime routine\n• Keep your bedroom cool and dark\n• Try meditation or deep breathing\n\nHow long have you been experiencing sleep difficulties?";
    }

    // Overwhelmed
    if (lowerMessage.includes('overwhelm') || lowerMessage.includes('too much') || lowerMessage.includes('can\'t cope')) {
      return "Feeling overwhelmed is a sign you need support. Let's break things down:\n\n• Identify the most urgent task and focus on that\n• Say no to new commitments if possible\n• Ask for help - it's a sign of strength, not weakness\n• Take regular breaks throughout the day\n\nWhat specific area feels most overwhelming right now?";
    }

    // Positive emotions
    if (lowerMessage.includes('happy') || lowerMessage.includes('great') || lowerMessage.includes('excited') || lowerMessage.includes('good')) {
      return "That's wonderful to hear! It's important to acknowledge and celebrate positive moments. Consider:\n\n• Writing about this in a gratitude journal\n• Sharing your joy with someone close to you\n• Take a moment to really savor this feeling\n• Think about what led to this happiness\n\nWhat's making you feel so positive?";
    }

    // Default response with emotion context
    let response = "I'm here to support you. ";
    
    if (emotionData?.dominant_emotion) {
      const emotion = emotionData.dominant_emotion;
      response += `I notice you've been experiencing ${emotion} recently. `;
    }
    
    response += "Could you tell me more about how you're feeling right now? I'm listening and here to help.";
    
    return response;
  }

  // ============================================
  // RECOMMENDATIONS (with fallback)
  // ============================================
  static async generateEmotionRecommendations(
    userId: string,
    emotionData: any
  ): Promise<string[]> {
    try {
      // Try HF API first
      const prompt = `Based on emotion: ${emotionData.dominant_emotion}. Provide 5 wellness tips.`;

      const response = await hf.textGeneration({
        model: 'facebook/blenderbot-400M-distill',
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.8,
        },
      });

      const text = response.generated_text;
      const recommendations = text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(0, 5);

      if (recommendations.length > 0) {
        console.log(`✅ Generated ${recommendations.length} HF recommendations`);
        return recommendations;
      }
      
      throw new Error('No recommendations generated');
    } catch (error) {
      console.log('🔄 HF API failed, using template recommendations');
      return this.getFallbackRecommendations(emotionData.dominant_emotion);
    }
  }

  // ============================================
  // FALLBACK RECOMMENDATIONS (Always works)
  // ============================================
  private static getFallbackRecommendations(emotion: string): string[] {
    const recommendations: Record<string, string[]> = {
      sadness: [
        'Take a short walk outside or get some fresh air to boost your mood',
        'Reach out to a friend or loved one for a conversation',
        'Practice self-compassion by acknowledging your feelings without judgment',
        'Engage in a favorite hobby or activity that usually brings you joy',
        'Listen to uplifting music or watch content that makes you smile',
      ],
      anger: [
        'Take 10 deep breaths, counting slowly on each exhale',
        'Try progressive muscle relaxation to release physical tension',
        'Express your feelings through journaling or creative outlets',
        'Step away from the situation temporarily to gain perspective',
        'Engage in physical exercise like walking, running, or yoga',
      ],
      fear: [
        'Use the 5-4-3-2-1 grounding technique to stay present',
        'Talk to someone you trust about what\'s worrying you',
        'Challenge anxious thoughts by examining the evidence',
        'Practice mindfulness meditation for 5-10 minutes',
        'Break down overwhelming concerns into smaller, manageable steps',
      ],
      joy: [
        'Share your positive feelings with friends or family',
        'Document this moment in a gratitude journal',
        'Use this positive energy for creative or productive activities',
        'Practice acts of kindness to spread the joy to others',
        'Take time to reflect on what led to this happiness',
      ],
      surprise: [
        'Take a moment to process and acknowledge this unexpected feeling',
        'Journal about the experience to understand it better',
        'Talk to someone about what surprised you',
        'Embrace the novelty and see it as an opportunity to learn',
        'Give yourself time to adjust to the new situation',
      ],
      neutral: [
        'Check in with your emotions throughout the day',
        'Try a new activity to boost your mood and energy',
        'Practice mindfulness to increase emotional awareness',
        'Set small, achievable goals to create a sense of purpose',
        'Connect with others through meaningful conversations',
      ],
    };

    const recs = recommendations[emotion] || recommendations.neutral;
    console.log(`✅ Using ${recs.length} template recommendations for ${emotion}`);
    return recs;
  }

  // ============================================
  // SENTIMENT ANALYSIS
  // ============================================
  static async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
  }> {
    try {
      const result = await hf.textClassification({
        model: 'distilbert-base-uncased-finetuned-sst-2-english',
        inputs: text,
      });

      const topResult = result[0];
      const sentiment = topResult.label.toLowerCase() as 'positive' | 'negative';
      const score = topResult.score;

      return {
        sentiment: score > 0.6 ? sentiment : 'neutral',
        score,
      };
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      // Fallback to neutral
      return { sentiment: 'neutral', score: 0.5 };
    }
  }
}