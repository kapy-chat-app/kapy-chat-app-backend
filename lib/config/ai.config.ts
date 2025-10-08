// src/lib/config/ai.config.ts
// Centralized AI service configuration

export const AI_CONFIG = {
  // Chọn provider: 'openai' | 'huggingface' | 'template'
  EMOTION_PROVIDER: process.env.OPENAI_API_KEY 
    ? 'openai' 
    : 'template', // Sử dụng template nếu không có OpenAI key
    
  CHAT_PROVIDER: process.env.OPENAI_API_KEY 
    ? 'openai' 
    : 'template',
    
  RECOMMENDATIONS_PROVIDER: process.env.OPENAI_API_KEY 
    ? 'openai' 
    : 'template',

  // OpenAI settings
  OPENAI: {
    MODEL: 'gpt-4o-mini', // hoặc 'gpt-4o' cho chất lượng cao nhất
    MAX_TOKENS: 500,
    TEMPERATURE: 0.7,
  },

  // Hugging Face settings (không khuyến nghị cho free tier)
  HUGGINGFACE: {
    EMOTION_MODEL: 'j-hartmann/emotion-english-distilroberta-base',
    CHAT_MODELS: [
      'facebook/blenderbot-400M-distill',
      'microsoft/DialoGPT-small',
    ],
    ENABLED: false, // Set false để không thử HF API
  },

  // Template-based settings (luôn hoạt động)
  TEMPLATE: {
    EMOTION_THRESHOLD: 0.5, // Confidence threshold cho rule-based
    RECOMMENDATIONS_COUNT: 5,
  },

  // Feature flags
  FEATURES: {
    REAL_TIME_EMOTION: true,
    FLOATING_NOTIFICATIONS: true,
    EMOTION_TRENDS: true,
    AI_CHAT: true,
  },

  // Cache settings
  CACHE: {
    EMOTION_TTL: 5 * 60 * 1000, // 5 minutes
    RECOMMENDATIONS_TTL: 30 * 60 * 1000, // 30 minutes
  },
};

// Helper để check provider availability
export const isProviderAvailable = (provider: string): boolean => {
  switch (provider) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'huggingface':
      return AI_CONFIG.HUGGINGFACE.ENABLED && !!process.env.HUGGINGFACE_API_KEY;
    case 'template':
      return true; // Luôn available
    default:
      return false;
  }
};

// Get active provider
export const getActiveProvider = (service: 'emotion' | 'chat' | 'recommendations'): string => {
  const providers = {
    emotion: AI_CONFIG.EMOTION_PROVIDER,
    chat: AI_CONFIG.CHAT_PROVIDER,
    recommendations: AI_CONFIG.RECOMMENDATIONS_PROVIDER,
  };
  
  const provider = providers[service];
  
  if (isProviderAvailable(provider)) {
    return provider;
  }
  
  // Fallback to template
  return 'template';
};

// Cost estimation (chỉ cho OpenAI)
export const estimateCost = (tokens: number): number => {
  if (AI_CONFIG.EMOTION_PROVIDER !== 'openai') return 0;
  
  // GPT-4o-mini pricing: $0.150 / 1M input tokens, $0.600 / 1M output tokens
  const inputCost = (tokens * 0.150) / 1000000;
  const outputCost = (tokens * 0.600) / 1000000;
  
  return inputCost + outputCost;
};