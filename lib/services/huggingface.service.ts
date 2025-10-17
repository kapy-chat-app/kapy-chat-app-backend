/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/services/huggingface.service.ts - AI-POWERED WITH VIETNAMESE TRANSLATION
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
          } else if (label.includes('neutral')) {
            emotionMap.neutral = Math.max(emotionMap.neutral, score);
          } else if (emotionMap.hasOwnProperty(label)) {
            emotionMap[label] = score;
          }

          if (score > maxScore) {
            maxScore = score;
            // Map the dominant emotion properly
            if (label.includes('joy') || label === 'happiness' || label === 'happy') {
              dominantEmotion = 'joy';
            } else if (label.includes('sad') || label === 'sadness') {
              dominantEmotion = 'sadness';
            } else if (label.includes('anger') || label === 'angry') {
              dominantEmotion = 'anger';
            } else if (label.includes('fear') || label === 'scared') {
              dominantEmotion = 'fear';
            } else if (label.includes('surprise')) {
              dominantEmotion = 'surprise';
            } else if (emotionMap.hasOwnProperty(label)) {
              dominantEmotion = label;
            }
          }
        });
      } else if (modelName.includes('sentiment')) {
        result.forEach((item: any) => {
          const label = item.label.toLowerCase();
          const score = item.score;

          if (label.includes('positive') || label === '5 stars' || label === '4 stars') {
            emotionMap.joy = score;
            if (score > maxScore) {
              maxScore = score;
              dominantEmotion = 'joy';
            }
          } else if (label.includes('negative') || label === '1 star' || label === '2 stars') {
            emotionMap.sadness = score * 0.6;
            emotionMap.anger = score * 0.4;
            if (score > maxScore) {
              maxScore = score;
              dominantEmotion = 'sadness';
            }
          } else if (label.includes('neutral') || label === '3 stars') {
            emotionMap.neutral = score;
            if (score > maxScore) {
              maxScore = score;
              dominantEmotion = 'neutral';
            }
          }
        });
      }

      const total = Object.values(emotionMap).reduce((sum, score) => sum + score, 0);
      if (total > 0) {
        Object.keys(emotionMap).forEach(emotion => {
          emotionMap[emotion] = emotionMap[emotion] / total;
        });
      }

      return {
        emotion: dominantEmotion,
        score: maxScore,
        allScores: emotionMap as any,
        method: 'ai'
      };
    } catch (error) {
      console.error('Error parsing AI result:', error);
      return null;
    }
  }

  // ============================================
  // 🇻🇳 ENHANCED FALLBACK WITH VIETNAMESE CONTEXT
  // ============================================
  private static analyzeEmotionIntelligentFallback(text: string): EmotionResult {
    const lowerText = text.toLowerCase();
    
    // Enhanced emotion keywords with teen code and common variations
    const emotionKeywords = {
      joy: [
        // English
        'happy', 'great', 'wonderful', 'love', 'excited', 'joy', 'amazing', 'excellent',
        'fantastic', 'awesome', 'blessed', 'grateful', 'delighted', 'cheerful', 'pleased',
        'thrilled', 'perfect', 'yay', 'woohoo', 'nice', 'good', 'best', 'beautiful',
        
        // Vietnamese - standard
        'vui', 'vui vẻ', 'vui sướng', 'hạnh phúc', 'tuyệt vời', 'tốt', 'hay', 'thích',
        'yêu', 'mến', 'thích thú', 'phấn khích', 'hào hứng', 'sung sướng', 'khoái',
        'tuyệt', 'xuất sắc', 'tốt lắm', 'ngon', 'ổn áp', 'đỉnh', 'xịn', 'chất',
        
        // Vietnamese teen code & slang
        'hehe', 'hihi', 'happy', 'yeah', 'oke', 'okie', 'okela', 'cưng', 'iu',
        'yolo', 'nice', 'ok nha', 'dc', 'được', 'tuyezt', 'tuyet', 'dinhf', 'pro',
        'kute', 'cute', 'dễ thương', 'dzui', 'vvui', 'vuii', 'haha', 'hahaha',
        'hehe', 'xinh', 'dep', 'đẹp', 'ghê', 'giỏi', 'tuyệt zời', 'perfect',
        
        // Emojis
        '😊', '😄', '😃', '😁', '🥰', '😍', '❤️', '💕', '🎉', '🎊', '✨', '🌟', '👏', '🙌', '💖'
      ],
      
      sadness: [
        // English
        'sad', 'depressed', 'unhappy', 'lonely', 'miss', 'cry', 'hurt', 'broken',
        'disappointed', 'down', 'upset', 'blue', 'sorrow', 'grief',
        
        // Vietnamese - standard
        'buồn', 'buồn bã', 'buồn rầu', 'tủi thân', 'cô đơn', 'cô độc', 'nhớ', 'khóc',
        'đau', 'đau khổ', 'đau buồn', 'đau lòng', 'thất vọng', 'chán', 'chán nản',
        'thương', 'tiếc', 'mất', 'xa', 'chia tay', 'tan vỡ', 'thất tình',
        
        // Vietnamese teen code & slang
        'buồn vl', 'buồn vcl', 'buồn quá', 'buồn wa', 'huhuu', 'huhu', 'wuwu',
        'qq', 'qá buồn', 'bùn', 'buồn ơi', 'sad', 'tủi', 'đáng thương', 'éo',
        'tệ', 'tồi', 'buồn thế', 'muốn khóc', 'huhuhu', 'miss', 'nhớ quá',
        'ôi đau', 'chán đời', 'chán vcl', 'wtf', 'dm', 'vailon',
        
        // Emojis
        '😢', '😭', '😔', '😞', '😟', '🥺', '💔', '😿', '😥', '😪'
      ],
      
      anger: [
        // English  
        'angry', 'mad', 'furious', 'hate', 'annoyed', 'frustrated', 'pissed',
        'irritated', 'rage', 'damn',
        
        // Vietnamese - standard
        'giận', 'tức', 'tức giận', 'tức tối', 'bực', 'bực mình', 'ghét', 'căm',
        'cáu', 'phẫn nộ', 'điên', 'khó chịu', 'chán ghét', 'không ưa',
        
        // Vietnamese teen code & slang
        'vcl', 'vl', 'wtf', 'dm', 'đm', 'cmn', 'cc', 'vãi', 'vải', 'bực vl',
        'ghét vl', 'giận quá', 'cáu vcl', 'điên', 'ngu', 'đần', 'nực cười',
        'fake', 'ảo', 'khùng', 'tức ghê', 'bực mình quá', 'khó chịu vl',
        
        // Emojis
        '😠', '😡', '🤬', '😤', '💢', '👿', '😾', '🖕'
      ],
      
      fear: [
        // English
        'scared', 'afraid', 'worry', 'anxious', 'nervous', 'panic', 'terrified',
        'stress', 'fear',
        
        // Vietnamese - standard
        'sợ', 'sợ hãi', 'lo', 'lo lắng', 'lo âu', 'căng thẳng', 'hoảng', 'kinh',
        'khiếp', 'run', 'bồn chồn', 'bất an', 'hồi hộp', 'stress',
        
        // Vietnamese teen code & slang
        'sợ vl', 'sợ wa', 'sợ quá', 'lo wa', 'stress', 'căng', 'lo sợ',
        'hoảng vcl', 'sợ chết', 'omg', 'trời ơi', 'ối', 'ui', 'sợ quá trời',
        
        // Emojis
        '😨', '😰', '😱', '😧', '😦', '😬', '🥶', '😓'
      ],
      
      surprise: [
        // English
        'surprised', 'shocked', 'amazed', 'wow', 'omg', 'unexpected', 'wtf',
        
        // Vietnamese - standard
        'ngạc nhiên', 'bất ngờ', 'sốc', 'choáng', 'kinh ngạc', 'không ngờ',
        'không tin', 'lạ', 'kỳ lạ',
        
        // Vietnamese teen code & slang
        'wow', 'omg', 'wtf', 'woa', 'ơ', 'ủa', 'hả', 'sao', 'gì', 'hả',
        'trời ơi', 'ối', 'ui', 'ôi', 'sốc vcl', 'choáng vl', 'không tin nổi',
        'sao vậy', 'thật không', 'thật á', 'nghiêm túc', 'serious',
        
        // Emojis
        '😮', '😯', '😲', '🤯', '😳', '🙀', '‼️', '⁉️', '😱'
      ],
      
      neutral: [
        'ok', 'okay', 'fine', 'normal', 'alright', 'được', 'ổn', 'tạm', 'bình thường',
        'ừ', 'uhm', 'à', 'vâng', 'dạ', 'thôi', 'vậy', 'ok nha', 'oke', 'okie'
      ]
    };

    const scores: Record<string, number> = {
      joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, neutral: 0.15,
    };

    // Enhanced scoring with context awareness
    Object.entries(emotionKeywords).forEach(([emotion, keywords]) => {
      keywords.forEach(keyword => {
        if (lowerText.includes(keyword)) {
          // Count occurrences
          const regex = new RegExp(this.escapeRegex(keyword), 'gi');
          const matches = lowerText.match(regex) || [];
          const matchCount = matches.length;
          
          if (matchCount > 0) {
            // Base score
            let baseScore = 0.3;
            
            // Longer keywords = more specific = higher weight
            const lengthWeight = Math.min(keyword.length / 6, 2.5);
            
            // Multiple occurrences = stronger emotion
            const frequencyBonus = Math.min(matchCount * 0.5, 1.8);
            
            // Emoji bonus
            const isEmoji = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(keyword);
            const emojiBonus = isEmoji ? 1.5 : 1.0;
            
            scores[emotion] += (baseScore * lengthWeight * frequencyBonus * emojiBonus);
          }
        }
      });
    });

    // Context modifiers (exclamation marks, repetition, caps)
    const hasExclamation = (text.match(/!/g) || []).length;
    const hasQuestionMarks = (text.match(/\?/g) || []).length;
    const hasCapitalization = /[A-Z]{2,}/.test(text);
    const hasRepetition = /(.)\1{2,}/.test(text); // like "huhuhu", "hahaha"
    
    if (hasExclamation > 2) {
      scores.joy *= 1.3;
      scores.anger *= 1.2;
      scores.surprise *= 1.2;
    }
    
    if (hasCapitalization) {
      scores.anger *= 1.3;
      scores.surprise *= 1.2;
    }
    
    if (hasRepetition) {
      scores.joy *= 1.2;
      scores.sadness *= 1.3;
    }

    // Normalize scores
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (total > 0) {
      Object.keys(scores).forEach(emotion => {
        scores[emotion] = scores[emotion] / total;
      });
    } else {
      scores.neutral = 1.0;
    }

    const dominantEntry = Object.entries(scores).reduce((max, [emotion, score]) => 
      score > max[1] ? [emotion, score] : max
    );

    return {
      emotion: dominantEntry[0],
      score: dominantEntry[1],
      allScores: scores as any,
      method: 'fallback'
    };
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ============================================
  // 🆕 AI-POWERED RECOMMENDATIONS
  // ============================================
  static async generateEmotionRecommendations(
    userId: string,
    emotionData: any
  ): Promise<string[]> {
    const emotion = emotionData.dominant_emotion || 'neutral';
    const confidence = emotionData.confidence_score || 0.5;
    const messageContent = emotionData.text_analyzed || '';
    
    console.log(`💡 Generating AI recommendations for emotion: ${emotion} (${(confidence * 100).toFixed(0)}%)`);

    const models = [
      'meta-llama/Llama-3.2-3B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'HuggingFaceH4/zephyr-7b-beta',
    ];

    for (const model of models) {
      try {
        console.log(`🤖 Trying model: ${model}`);
        
        const prompt = this.buildRecommendationPrompt(emotion, confidence, messageContent);
        
        const response = await hf.chatCompletion({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an empathetic emotional wellness coach. Provide personalized, actionable recommendations based on the user\'s emotional state. Always be supportive and practical.'
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.85,
        });

        const content = response.choices[0]?.message?.content;
        
        if (content?.trim()) {
          const recommendations = this.parseRecommendations(content);
          
          if (recommendations.length >= 4) {
            console.log(`✅ AI generated ${recommendations.length} recommendations with ${model}`);
            return recommendations.slice(0, 6);
          }
        }
      } catch (error: any) {
        console.log(`⚠️ ${model} failed: ${error.message}`);
        continue;
      }
    }

    console.log('🔄 All AI models failed, using enhanced fallback');
    return this.getEnhancedFallbackRecommendations(emotion, confidence, messageContent);
  }

  private static buildRecommendationPrompt(
    emotion: string, 
    confidence: number,
    messageContent: string
  ): string {
    const contextSnippet = messageContent.substring(0, 100);
    const intensityLevel = confidence > 0.7 ? 'strongly' : confidence > 0.5 ? 'moderately' : 'slightly';
    
    const prompts: Record<string, string> = {
      joy: `A person is feeling ${intensityLevel} joyful. Their message: "${contextSnippet}..."
      
Provide 5 practical recommendations to:
1. Help them celebrate and appreciate this positive moment
2. Share their happiness with others meaningfully
3. Channel this energy into productive activities
4. Create lasting memories of this positive experience
5. Use this positive state to tackle challenges

Format as a numbered list. Be specific and actionable.`,

      sadness: `A person is feeling ${intensityLevel} sad. Their message: "${contextSnippet}..."
      
Provide 5 empathetic and practical recommendations to:
1. Acknowledge and process their feelings healthily
2. Connect with supportive people or resources
3. Engage in gentle self-care activities
4. Find small ways to boost their mood
5. Remember that this feeling is temporary

Format as a numbered list. Be compassionate and actionable.`,

      anger: `A person is feeling ${intensityLevel} angry. Their message: "${contextSnippet}..."
      
Provide 5 calming and constructive recommendations to:
1. Release tension in healthy ways (physical activity, breathing)
2. Process the root cause of their anger
3. Communicate their feelings effectively
4. Avoid actions they might regret
5. Channel this energy into positive change

Format as a numbered list. Be understanding and practical.`,

      fear: `A person is feeling ${intensityLevel} fearful or anxious. Their message: "${contextSnippet}..."
      
Provide 5 grounding and reassuring recommendations to:
1. Use immediate calming techniques (breathing, grounding)
2. Break down their concerns into manageable parts
3. Seek support from trusted people
4. Challenge anxious thoughts with evidence
5. Take small, safe steps forward

Format as a numbered list. Be calming and supportive.`,

      surprise: `A person is feeling ${intensityLevel} surprised. Their message: "${contextSnippet}..."
      
Provide 5 helpful recommendations to:
1. Process this unexpected information or event
2. Take time to understand what happened
3. Share their experience if helpful
4. Adjust their plans if needed
5. Learn from this unexpected situation

Format as a numbered list. Be balanced and thoughtful.`,

      neutral: `A person is feeling ${intensityLevel} neutral or calm. Their message: "${contextSnippet}..."
      
Provide 5 proactive recommendations to:
1. Use this balanced state to plan ahead
2. Practice mindfulness and presence
3. Set meaningful goals or intentions
4. Connect with others meaningfully
5. Engage in activities that bring fulfillment

Format as a numbered list. Be encouraging and practical.`
    };

    return prompts[emotion] || prompts.neutral;
  }

  private static parseRecommendations(content: string): string[] {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const recommendations: string[] = [];

    for (const line of lines) {
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
  // AUDIO EMOTION ANALYSIS
  // ============================================
  static async analyzeAudioEmotion(audioBuffer: Buffer): Promise<EmotionResult> {
    try {
      const transcription = await hf.automaticSpeechRecognition({
        model: 'openai/whisper-base',
        data: audioBuffer,
      });

      const text = transcription.text;
      console.log(`🎤 Transcribed audio: "${text}"`);
      return await this.analyzeEmotion(text);
    } catch (error) {
      console.error('Error analyzing audio emotion:', error);
      return {
        emotion: 'neutral',
        score: 0.5,
        allScores: {
          joy: 0.1, sadness: 0.1, anger: 0.1, fear: 0.1, surprise: 0.1, neutral: 0.5,
        },
        method: 'fallback'
      };
    }
  }

  // ============================================
  // CHAT RESPONSE
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
      return { sentiment: 'neutral', score: 0.5 };
    }
  }
}