// instrumentation.ts (root level - cùng cấp với folder app/)

export async function register() {
  // ⭐ Chỉ chạy trên server (không chạy trên Edge Runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Dynamic import để tránh load trên client
      const { initializeFirebaseAdmin } = await import('./lib/firebase-admin');
      
      initializeFirebaseAdmin();
      console.log('✅ Firebase Admin SDK initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin:', error);
      // Không throw để server vẫn chạy được
    }
  }
}