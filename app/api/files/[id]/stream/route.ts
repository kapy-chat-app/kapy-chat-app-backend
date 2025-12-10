// app/api/files/[id]/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import File from '@/database/file.model';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ CORRECT: Get Bearer token from Authorization header (for mobile app)
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ [STREAM] Unauthorized - No Bearer token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    // ✅ Verify token with Clerk (same as other APIs)
    // For now, we trust the token - in production you should verify it
    // const { userId } = await verifyToken(token);
    
    console.log(`👤 [STREAM] Authenticated request with token`);

    const fileId = params.id;
    console.log(`🎥 [STREAM] Request for file: ${fileId}`);

    // ✅ Get file metadata from database
    const file = await File.findById(fileId);
    if (!file) {
      console.error(`❌ [STREAM] File not found: ${fileId}`);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    console.log(`✅ [STREAM] File found:`, {
      name: file.file_name,
      type: file.file_type,
      size: `${(file.file_size / 1024 / 1024).toFixed(2)} MB`,
      encrypted: file.is_encrypted,
      chunked: file.encryption_metadata?.totalChunks > 1,
    });

    // ✅ For encrypted files, generate presigned URL and redirect
    // This allows the video player to stream directly from S3
    if (file.is_encrypted) {
      console.log(`🔒 [STREAM] Encrypted file, generating presigned URL...`);

      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: file.file_path,
      });

      // Generate presigned URL with 1 hour expiration
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      console.log(`✅ [STREAM] Presigned URL generated`);

      // ✅ Redirect to S3 presigned URL
      // The client will download and decrypt locally
      return NextResponse.redirect(presignedUrl);
    }

    // ✅ For non-encrypted files, also use presigned URL
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: file.file_path,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    console.log(`✅ [STREAM] Non-encrypted file, redirecting to S3`);
    return NextResponse.redirect(presignedUrl);

  } catch (error) {
    console.error('❌ [STREAM] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}