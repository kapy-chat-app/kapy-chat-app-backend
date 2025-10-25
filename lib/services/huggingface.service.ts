/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/services/huggingface.service.ts - AI-POWERED WITH VIETNAMESE TRANSLATION + CALL EMOTION ANALYSIS
import { InferenceClient } from '@huggingface/inference';

const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);

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
  method: 'ai' | 'fallback';
  language?: 'en' | 'vi' | 'mixed';
  translatedText?: string;
  audioFeatures?: {
    tone: string;
    pitch: number;
    speed: number;
    volume: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class HuggingFaceService {
  // ============================================
  // 🌍 LANGUAGE DETECTION
  // ============================================
  private static detectLanguage(text: string): 'en' | 'vi' | 'mixed' {
    const vietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    const vietnameseWords = /\b(tôi|bạn|mình|không|được|rất|vui|buồn|giận|sợ|ổn|thích|ghét|yêu|nhớ|là|của|có|trong|ngoài|với|và|nhưng|vì|nên|thì|cho|để|người|này|đó|kia|gì|sao|như|thế|nào)\b/i;
    
    const hasVietnamese = vietnameseChars.test(text) || vietnameseWords.test(text);
    const englishWords = text.match(/\b[a-z]+\b/gi) || [];
    const hasSignificantEnglish = englishWords.length > 3;
    
    if (hasVietnamese && hasSignificantEnglish) return 'mixed';
    if (hasVietnamese) return 'vi';
    return 'en';
  }

  // ============================================
  // 🔄 VIETNAMESE TO ENGLISH TRANSLATION
  // ============================================
  private static async translateToEnglish(text: string): Promise<string> {
    console.log(`🌐 Translating Vietnamese to English: "${text.substring(0, 50)}..."`);
    
    // Try multiple translation models
    const translationModels = [
      'Helsinki-NLP/opus-mt-vi-en',
      'facebook/nllb-200-distilled-600M',
    ];

    for (const model of translationModels) {
      try {
        console.log(`🤖 Trying translation model: ${model}`);
        
        let result;
        if (model.includes('nllb')) {
          // NLLB model uses different format
          result = await hf.translation({
            model,
            inputs: text,
            parameters: {
              src_lang: 'vie_Latn',
              tgt_lang: 'eng_Latn'
            }
          });
        } else {
          // Standard Helsinki model
          result = await hf.translation({
            model,
            inputs: text,
          });
        }

        const translatedText = result.translation_text || result[0]?.translation_text || '';
        
        if (translatedText && translatedText.trim().length > 0) {
          console.log(`✅ Translation success: "${translatedText.substring(0, 50)}..."`);
          return translatedText;
        }
      } catch (error: any) {
        console.log(`⚠️ ${model} translation failed: ${error.message}`);
        continue;
      }
    }

    console.log('⚠️ All translation models failed, using original text');
    return text;
  }

  // ============================================
  // 🤖 AI EMOTION ANALYSIS WITH AUTO-TRANSLATION
  // ============================================
  static async analyzeEmotion(text: string): Promise<EmotionResult> {
    console.log(`🔍 Analyzing emotion for: "${text.substring(0, 50)}..."`);
    
    const language = this.detectLanguage(text);
    console.log(`🌍 Detected language: ${language}`);

    let textToAnalyze = text;
    let translatedText: string | undefined;

    // If Vietnamese or mixed, try to translate first
    if (language === 'vi' || language === 'mixed') {
      try {
        translatedText = await this.translateToEnglish(text);
        // Only use translation if it's meaningfully different and not empty
        if (translatedText && translatedText.length > 3 && translatedText !== text) {
          textToAnalyze = translatedText;
          console.log(`✅ Using translated text for analysis`);
        }
      } catch (error: any) {
        console.log(`⚠️ Translation failed, using original: ${error.message}`);
      }
    }

    // Choose models based on language
    const models = language === 'en' 
      ? [
          'j-hartmann/emotion-english-distilroberta-base',
          'SamLowe/roberta-base-go_emotions',
          'cardiffnlp/twitter-roberta-base-sentiment-latest',
        ]
      : [
          'cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual',
          'nlptown/bert-base-multilingual-uncased-sentiment',
          'j-hartmann/emotion-english-distilroberta-base',
        ];

    // Try AI models
    for (const model of models) {
      try {
        console.log(`🤖 Trying AI model: ${model}`);
        
        const result = await hf.textClassification({
          model,
          inputs: textToAnalyze,
        });

        const emotionResult = this.parseAIEmotionResult(result, model);
        
        if (emotionResult) {
          console.log(`✅ AI Success with ${model}: ${emotionResult.emotion} (${(emotionResult.score * 100).toFixed(0)}%)`);
          return {
            ...emotionResult,
            method: 'ai',
            language,
            translatedText: language !== 'en' ? translatedText : undefined
          };
        }
      } catch (error: any) {
        console.log(`⚠️ ${model} failed: ${error.message}`);
        continue;
      }
    }

    console.log('🔄 All AI models failed, using intelligent fallback');
    return {
      ...this.analyzeEmotionIntelligentFallback(text),
      method: 'fallback',
      language
    };
  }

  private static parseAIEmotionResult(result: any[], modelName: string): EmotionResult | null {
    try {
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

      if (modelName.includes('emotion') || modelName.includes('go_emotions')) {
        result.forEach((item: any) => {
          const label = item.label.toLowerCase();
          const score = item.score;

          // Map various emotion labels
          if (label.includes('joy') || label === 'happiness' || label === 'happy') {
            emotionMap.joy = Math.max(emotionMap.joy, score);
          } else if (label.includes('sad') || label === 'sadness') {
            emotionMap.sadness = Math.max(emotionMap.sadness, score);
          } else if (label.includes('anger') || label === 'angry') {
            emotionMap.anger = Math.max(emotionMap.anger, score);
          } else if (label.includes('fear') || label === 'scared') {
            emotionMap.fear = Math.max(emotionMap.fear, score);
          } else if (label.includes('surprise') || label === 'surprised') {
            emotionMap.surprise = Math.max(emotionMap.surprise, score);
          } else if (label.includes('neutral') || label === 'calm') {
            emotionMap.neutral = Math.max(emotionMap.neutral, score);
          }

          if (score > maxScore) {
            maxScore = score;
            dominantEmotion = label;
          }
        });
      } else if (modelName.includes('sentiment')) {
        result.forEach((item: any) => {
          const label = item.label.toLowerCase();
          const score = item.score;

          if (label.includes('positive') || label.includes('pos') || label === '4 stars' || label === '5 stars') {
            emotionMap.joy = Math.max(emotionMap.joy, score);
          } else if (label.includes('negative') || label.includes('neg') || label === '1 star' || label === '2 stars') {
            emotionMap.sadness = Math.max(emotionMap.sadness, score * 0.6);
            emotionMap.anger = Math.max(emotionMap.anger, score * 0.4);
          } else if (label.includes('neutral') || label === '3 stars') {
            emotionMap.neutral = Math.max(emotionMap.neutral, score);
          }

          if (score > maxScore) {
            maxScore = score;
          }
        });
      }

      // Normalize scores to sum to 1
      const totalScore = Object.values(emotionMap).reduce((sum, val) => sum + val, 0);
      if (totalScore > 0) {
        for (const emotion in emotionMap) {
          emotionMap[emotion] /= totalScore;
        }
      }

      // Get dominant emotion with highest score
      const sortedEmotions = Object.entries(emotionMap).sort((a, b) => b[1] - a[1]);
      const [topEmotion, topScore] = sortedEmotions[0];

      return {
        emotion: topEmotion,
        score: topScore,
        allScores: emotionMap as any,
        method: 'ai',
      };
    } catch (error) {
      console.error('Error parsing AI emotion result:', error);
      return null;
    }
  }

  private static analyzeEmotionIntelligentFallback(text: string): EmotionResult {
    const lowerText = text.toLowerCase();
    
    // Vietnamese emotion keywords
    const emotionKeywords = {
      joy: {
        en: ['happy', 'joy', 'great', 'love', 'wonderful', 'amazing', 'excellent', 'good', 'glad', 'delighted', 'excited', 'blessed', 'grateful', 'thankful'],
        vi: ['vui', 'hạnh phúc', 'tuyệt vời', 'yêu', 'thích', 'tốt', 'hay', 'giỏi', 'mừng', 'sung sướng', 'phấn khởi'],
        emoji: ['😊', '😄', '😃', '😁', '❤️', '🥰', '😍', '🎉', '✨']
      },
      sadness: {
        en: ['sad', 'unhappy', 'sorry', 'disappointed', 'miss', 'lonely', 'depressed', 'hurt', 'pain', 'cry', 'heartbroken'],
        vi: ['buồn', 'không vui', 'thất vọng', 'nhớ', 'cô đơn', 'u sầu', 'đau', 'khóc', 'lòng nặng'],
        emoji: ['😢', '😭', '😔', '☹️', '🥺', '💔']
      },
      anger: {
        en: ['angry', 'mad', 'hate', 'furious', 'annoyed', 'frustrated', 'irritated', 'pissed', 'upset'],
        vi: ['tức', 'giận', 'ghét', 'bực', 'khó chịu', 'phật lòng', 'điên tiết', 'tức giận'],
        emoji: ['😠', '😡', '🤬', '😤']
      },
      fear: {
        en: ['afraid', 'scared', 'worried', 'anxious', 'nervous', 'terrified', 'panic', 'stress', 'concerned'],
        vi: ['sợ', 'lo', 'lo lắng', 'hãi', 'căng thẳng', 'hoảng', 'bồn chồn', 'lo âu'],
        emoji: ['😨', '😰', '😱', '😟', '😧']
      },
      surprise: {
        en: ['wow', 'omg', 'shocked', 'surprised', 'unexpected', 'unbelievable', 'astonished'],
        vi: ['ôi', 'trời', 'bất ngờ', 'ngạc nhiên', 'kinh ngạc', 'không ngờ'],
        emoji: ['😮', '😲', '😯', '🤯']
      }
    };

    const emotionScores = {
      joy: 0,
      sadness: 0,
      anger: 0,
      fear: 0,
      surprise: 0,
      neutral: 0.3,
    };

    // Check for emotion keywords
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      const allKeywords = [...keywords.en, ...keywords.vi, ...keywords.emoji];
      allKeywords.forEach((keyword) => {
        if (lowerText.includes(keyword.toLowerCase())) {
          emotionScores[emotion as keyof typeof emotionScores] += 0.2;
        }
      });
    }

    // Normalize scores
    const totalScore = Object.values(emotionScores).reduce((a, b) => a + b, 0);
    if (totalScore > 0) {
      for (const key in emotionScores) {
        emotionScores[key as keyof typeof emotionScores] /= totalScore;
      }
    }

    const dominantEmotion = Object.entries(emotionScores).reduce((max, [emotion, score]) =>
      score > max.score ? { emotion, score } : max,
      { emotion: 'neutral', score: 0.3 }
    );

    return {
      emotion: dominantEmotion.emotion,
      score: dominantEmotion.score,
      allScores: emotionScores,
      method: 'fallback',
    };
  }

  // ============================================
  // 🎯 EMOTION-BASED RECOMMENDATIONS
  // ============================================
  static async generateEmotionRecommendations(
    emotion: string,
    confidence: number,
    messageContent: string
  ): Promise<string[]> {
    try {
      console.log(`🎯 Generating recommendations for emotion: ${emotion} (${confidence})`);

      const prompt = `Based on the emotion "${emotion}" with confidence ${(confidence * 100).toFixed(0)}%, provide 3-6 short, practical, and empathetic recommendations or supportive suggestions. Each recommendation should be 1-2 sentences. Focus on actionable advice and emotional support.

Message context: "${messageContent.substring(0, 100)}"

Provide recommendations in this format:
1. [First recommendation]
2. [Second recommendation]
3. [Third recommendation]`;

      const models = [
        'meta-llama/Llama-3.2-3B-Instruct',
        'mistralai/Mistral-7B-Instruct-v0.3',
        'HuggingFaceH4/zephyr-7b-beta',
      ];

      for (const model of models) {
        try {
          const response = await hf.chatCompletion({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an empathetic AI assistant providing emotional support and practical recommendations.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 300,
            temperature: 0.7,
          });

          const content = response.choices[0]?.message?.content;
          
          if (content && content.trim()) {
            console.log(`✅ AI recommendations generated with ${model}`);
            return this.parseRecommendations(content);
          }
        } catch (modelError: any) {
          console.log(`⚠️ ${model} failed: ${modelError.message}`);
          continue;
        }
      }

      console.log('🔄 AI recommendations failed, using fallback');
      return this.getEnhancedFallbackRecommendations(emotion, confidence, messageContent);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return this.getEnhancedFallbackRecommendations(emotion, confidence, messageContent);
    }
  }

  private static parseRecommendations(aiResponse: string): string[] {
    const lines = aiResponse.split('\n').filter(line => line.trim());
    const recommendations: string[] = [];

    for (let line of lines) {
      let cleaned = line
        .replace(/^\d+[\.)]\s*/, '')
        .replace(/^[-*•]\s*/, '')
        .replace(/^\**\d+\.\**\s*/, '')
        .trim();

      if (cleaned.length < 15 || cleaned.length > 300) continue;
      if (cleaned.endsWith(':') || cleaned.startsWith('Provide')) continue;

      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      if (!cleaned.match(/[.!?]$/)) cleaned += '.';

      recommendations.push(cleaned);
      if (recommendations.length >= 6) break;
    }

    return recommendations;
  }

  private static getEnhancedFallbackRecommendations(
    emotion: string,
    confidence: number,
    messageContent: string
  ): string[] {
    const intensityPrefix = confidence > 0.7 ? 'You seem to be feeling quite' : 'You might be feeling';
    
    const recommendations: Record<string, string[]> = {
      joy: [
        `${intensityPrefix} happy! Take a moment to savor this positive feeling and appreciate what brought you here.`,
        'Share your joy with someone you care about - positive emotions are contagious and meaningful when shared.',
        'Document this moment in a journal or photo so you can revisit it during challenging times.',
        'Use this positive energy to tackle a task you\'ve been putting off - motivation is highest when we feel good.',
        'Practice gratitude by listing 3 specific things that contributed to this happiness.',
        'Consider doing something kind for someone else to amplify these positive feelings.',
      ],
      
      sadness: [
        `${intensityPrefix} down right now. Remember that it\'s okay to feel sad - emotions are temporary and valid.`,
        'Reach out to a trusted friend or family member. Talking about your feelings can provide comfort and perspective.',
        'Engage in gentle self-care: take a warm shower, listen to calming music, or make yourself a comforting drink.',
        'Try a short walk outside. Fresh air and light movement can help lift your mood gradually.',
        'Practice self-compassion. Treat yourself with the same kindness you\'d show a friend who\'s struggling.',
        'If sadness persists for weeks, consider reaching out to a mental health professional for support.',
      ],
      
      anger: [
        `${intensityPrefix} frustrated or angry. Take 10 slow, deep breaths to calm your nervous system.`,
        'Step away from the situation temporarily if possible. Distance can provide valuable perspective.',
        'Express your feelings through journaling or physical exercise to release pent-up tension safely.',
        'Identify the root cause: What need isn\'t being met? What boundary was crossed?',
        'When calm, communicate your feelings using "I feel" statements rather than accusations.',
        'Channel this energy constructively - anger can fuel positive change when directed wisely.',
      ],
      
      fear: [
        `${intensityPrefix} anxious or worried. Try the 5-4-3-2-1 grounding technique to anchor yourself in the present.`,
        'Talk to someone you trust about your concerns. Sharing worries often makes them feel less overwhelming.',
        'Challenge anxious thoughts: What evidence supports or contradicts your fear? What\'s the worst/best/most likely outcome?',
        'Practice progressive muscle relaxation or guided meditation to reduce physical tension.',
        'Break large concerns into smaller, actionable steps. Action combats anxiety effectively.',
        'Remember past challenges you\'ve overcome. You have more resilience than you realize.',
      ],
      
      surprise: [
        `${intensityPrefix} surprised or caught off-guard. Take a moment to process what just happened.`,
        'Allow yourself time to adjust to this new information or situation. Surprise can be disorienting.',
        'Share your experience with someone if it would help you process it better.',
        'Consider how this surprise might open new opportunities or perspectives you hadn\'t considered.',
        'If this surprise is positive, enjoy the spontaneity. If challenging, remind yourself that you can adapt.',
        'Reflect on what this surprise teaches you about expectations and flexibility.',
      ],
      
      neutral: [
        `You seem to be in a balanced emotional state. This is a great time for reflection and planning.`,
        'Check in with yourself: What matters most to you right now? Set one meaningful intention for today.',
        'Practice mindfulness. Notice the present moment without judgment - what do you see, hear, feel?',
        'Connect with someone meaningful. Reach out with a thoughtful message or schedule time together.',
        'Engage in an activity that brings you fulfillment, whether creative, physical, or intellectual.',
        'Use this calm state to prepare for future challenges by building healthy routines.',
      ],
    };

    return recommendations[emotion] || recommendations.neutral;
  }

  // ============================================
  // 🎤 AUDIO EMOTION ANALYSIS (CALL SUPPORT)
  // ============================================
  static async analyzeAudioEmotion(audioBuffer: Buffer): Promise<EmotionResult> {
    try {
      console.log('🎤 Analyzing audio emotion via speech-to-text + emotion...');

      // First, transcribe audio using Whisper
      const transcription = await hf.automaticSpeechRecognition({
        model: 'openai/whisper-base',
        data: audioBuffer,
      });

      const text = transcription.text;
      console.log(`🎤 Transcribed audio: "${text}"`);
      
      // Then analyze emotion from transcribed text
      const emotionResult = await this.analyzeEmotion(text);
      
      // Add audio features placeholder
      return {
        ...emotionResult,
        audioFeatures: {
          tone: emotionResult.emotion,
          pitch: 0.5, // Would need actual pitch detection library
          speed: 1.0, // Would need actual speech rate detection
          volume: 0.7, // Would need actual volume analysis
        }
      };
    } catch (error) {
      console.error('❌ Audio emotion analysis failed:', error);
      // Return neutral emotion as fallback
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
        method: 'fallback',
        audioFeatures: {
          tone: 'neutral',
          pitch: 0.5,
          speed: 1.0,
          volume: 0.5,
        }
      };
    }
  }

  // ============================================
  // 📹 VIDEO EMOTION ANALYSIS (FACIAL EXPRESSION)
  // ============================================
  static async analyzeVideoEmotion(imageBuffer: Buffer): Promise<EmotionResult> {
    try {
      console.log('📹 Analyzing video/face emotion via HuggingFace...');

      const result = await hf.imageClassification({
        model: 'trpakov/vit-face-expression',
        data: imageBuffer,
      });

      // Map results to our emotion structure
      const emotionScores = {
        joy: 0,
        sadness: 0,
        anger: 0,
        fear: 0,
        surprise: 0,
        neutral: 0,
      };

      // Process HuggingFace facial expression results
      for (const item of result) {
        const label = item.label.toLowerCase();
        const score = item.score;

        if (label.includes('happy') || label.includes('joy')) {
          emotionScores.joy = Math.max(emotionScores.joy, score);
        } else if (label.includes('sad')) {
          emotionScores.sadness = Math.max(emotionScores.sadness, score);
        } else if (label.includes('angry') || label.includes('anger')) {
          emotionScores.anger = Math.max(emotionScores.anger, score);
        } else if (label.includes('fear') || label.includes('afraid')) {
          emotionScores.fear = Math.max(emotionScores.fear, score);
        } else if (label.includes('surprise')) {
          emotionScores.surprise = Math.max(emotionScores.surprise, score);
        } else if (label.includes('neutral')) {
          emotionScores.neutral = Math.max(emotionScores.neutral, score);
        }
      }

      // Normalize scores
      const totalScore = Object.values(emotionScores).reduce((a, b) => a + b, 0);
      if (totalScore > 0) {
        for (const key in emotionScores) {
          emotionScores[key as keyof typeof emotionScores] /= totalScore;
        }
      }

      // Find dominant emotion
      const dominantEmotion = Object.entries(emotionScores).reduce((max, [emotion, score]) =>
        score > max.score ? { emotion, score } : max,
        { emotion: 'neutral', score: 0 }
      );

      return {
        emotion: dominantEmotion.emotion,
        score: dominantEmotion.score,
        allScores: emotionScores,
        method: 'ai',
      };
    } catch (error) {
      console.error('❌ Video emotion analysis failed:', error);
      throw error;
    }
  }

  // ============================================
  // 🎭 COMBINE AUDIO + VIDEO EMOTION ANALYSIS
  // ============================================
  static combineEmotionAnalysis(
    audioResult: EmotionResult,
    videoResult: EmotionResult
  ): EmotionResult {
    const audioWeight = 0.6; // Audio is more reliable for emotion
    const videoWeight = 0.4;

    // Combine scores with weighting
    const combinedScores = {
      joy: audioResult.allScores.joy * audioWeight + videoResult.allScores.joy * videoWeight,
      sadness: audioResult.allScores.sadness * audioWeight + videoResult.allScores.sadness * videoWeight,
      anger: audioResult.allScores.anger * audioWeight + videoResult.allScores.anger * videoWeight,
      fear: audioResult.allScores.fear * audioWeight + videoResult.allScores.fear * videoWeight,
      surprise: audioResult.allScores.surprise * audioWeight + videoResult.allScores.surprise * videoWeight,
      neutral: audioResult.allScores.neutral * audioWeight + videoResult.allScores.neutral * videoWeight,
    };

    // Find dominant emotion
    const dominantEmotion = Object.entries(combinedScores).reduce((max, [emotion, score]) =>
      score > max.score ? { emotion, score } : max,
      { emotion: 'neutral', score: 0 }
    );

    return {
      emotion: dominantEmotion.emotion,
      score: dominantEmotion.score,
      allScores: combinedScores,
      method: 'ai',
      audioFeatures: audioResult.audioFeatures,
    };
  }

  // ============================================
  // 💬 CHAT RESPONSE
  // ============================================
  static async getChatResponse(
    messages: ChatMessage[],
    userEmotionData?: any
  ): Promise<string> {
    const lastMessage = messages[messages.length - 1]?.content || '';
    
    try {
      const models = [
        'meta-llama/Llama-3.2-3B-Instruct',
        'mistralai/Mistral-7B-Instruct-v0.3',
        'HuggingFaceH4/zephyr-7b-beta',
      ];

      for (const model of models) {
        try {
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
            return content.trim();
          }
        } catch (modelError: any) {
          continue;
        }
      }

      return this.getTemplateResponse(lastMessage, userEmotionData);
      
    } catch (error) {
      return this.getTemplateResponse(lastMessage, userEmotionData);
    }
  }

  private static getTemplateResponse(userMessage: string, emotionData?: any): string {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.match(/^(hi|hello|hey|xin chao|chào|chao)/i)) {
      return "Hello! I'm here to support your emotional wellbeing. How are you feeling today?";
    }

    if (lowerMessage.includes('stress') || lowerMessage.includes('lo lang') || lowerMessage.includes('lo lắng')) {
      return "I understand you're feeling stressed. Try taking deep breaths and breaking tasks into smaller steps. What's causing the most stress?";
    }

    if (lowerMessage.includes('buồn') || lowerMessage.includes('buon') || lowerMessage.includes('sad')) {
      return "I'm sorry you're feeling down. It's okay to feel sad sometimes. Would you like to talk about what's bothering you?";
    }

    return "I'm here to support you. Could you tell me more about how you're feeling?";
  }

  // ============================================
  // 📊 SENTIMENT ANALYSIS
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
      return { sentiment: 'neutral', score: 0.5 };
    }
  }
}

export default HuggingFaceService;