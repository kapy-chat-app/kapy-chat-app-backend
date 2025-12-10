// lib/uploadSessionStore.ts
export interface UploadSession {
  uploadId: string;
  conversationId: string;
  userId: string;
  clerkUserId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  fileType: string;
  thumbnailUrl?: string;
  uploadUrls: string[];
  uploadedChunks: Set<number>;
  createdAt: Date;
  timeoutId?: NodeJS.Timeout;
  // ✅ NEW: S3 multipart upload info
  s3UploadId?: string;
  s3Key?: string;
}

// ✅ Declare global type
declare global {
  // eslint-disable-next-line no-var
  var uploadSessionStore: UploadSessionStore | undefined;
}

// ✅ Singleton class
class UploadSessionStore {
  private sessions: Map<string, UploadSession>;

  constructor() {
    this.sessions = new Map();
    console.log('📦 UploadSessionStore initialized');
  }

  set(uploadId: string, session: UploadSession): void {
    this.sessions.set(uploadId, session);
    console.log(`✅ Session stored: ${uploadId} (Total: ${this.sessions.size})`);
  }

  get(uploadId: string): UploadSession | undefined {
    const session = this.sessions.get(uploadId);
    console.log(`🔍 Session lookup: ${uploadId} - ${session ? 'FOUND' : 'NOT FOUND'}`);
    return session;
  }

  // ✅ CRITICAL: Add this method
  updateS3Info(uploadId: string, s3UploadId: string, s3Key: string): boolean {
    const session = this.sessions.get(uploadId);
    if (!session) {
      console.error(`❌ Cannot update S3 info - session not found: ${uploadId}`);
      return false;
    }
    
    session.s3UploadId = s3UploadId;
    session.s3Key = s3Key;
    this.sessions.set(uploadId, session);
    
    console.log(`✅ S3 info updated for session: ${uploadId}`);
    console.log(`   S3 Upload ID: ${s3UploadId}`);
    console.log(`   S3 Key: ${s3Key}`);
    
    return true;
  }

  delete(uploadId: string): boolean {
    const deleted = this.sessions.delete(uploadId);
    console.log(`🗑️ Session deleted: ${uploadId} - ${deleted ? 'SUCCESS' : 'NOT FOUND'}`);
    return deleted;
  }

  has(uploadId: string): boolean {
    return this.sessions.has(uploadId);
  }

  size(): number {
    return this.sessions.size;
  }

  // Schedule auto-cleanup
  scheduleCleanup(uploadId: string, hours: number = 2): void {
    const session = this.sessions.get(uploadId);
    if (!session) return;

    // Clear old timeout
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      this.delete(uploadId);
      console.log(`⏰ [AUTO-CLEANUP] Session expired: ${uploadId}`);
    }, hours * 60 * 60 * 1000);

    session.timeoutId = timeoutId;
  }

  // Clear timeout before manual deletion
  clearTimeout(uploadId: string): void {
    const session = this.sessions.get(uploadId);
    if (session?.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = undefined;
    }
  }

  // ✅ Debug helper
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

// ✅ Use globalThis to persist across HMR
if (!globalThis.uploadSessionStore) {
  globalThis.uploadSessionStore = new UploadSessionStore();
}

export const uploadSessionStore = globalThis.uploadSessionStore;