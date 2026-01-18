/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/s3.ts - UPDATED WITH STREAMING UPLOAD SUPPORT
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { uploadSessionStore } from './uploadSessionStore';

// ✅ Validate AWS config
const validateAWSConfig = () => {
  if (
    !process.env.AWS_REGION ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    !process.env.AWS_S3_BUCKET
  ) {
    throw new Error("Missing AWS S3 configuration in environment variables");
  }
};

// ✅ Initialize S3 Client (singleton)
let s3Client: S3Client | null = null;

const getS3Client = () => {
  if (!s3Client) {
    validateAWSConfig();
    s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
};

// ✅ Upload result interface
export interface S3UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  bucket?: string;
  size?: number;
  error?: string;
}

// =============================================
// ✅ EXISTING FUNCTIONS (UNCHANGED)
// =============================================

// ✅ Upload file to S3
export async function uploadToS3(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  folder: string = 'files',
  metadata?: Record<string, string>
): Promise<S3UploadResult> {
  try {
    const client = getS3Client();
    
    const timestamp = Date.now();
    const randomString = uuidv4().substring(0, 8);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${folder}/${timestamp}_${randomString}_${sanitizedFileName}`;

    console.log(`📤 Uploading to S3: ${key}`);
    console.log(`   Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: fileType || 'application/octet-stream',
      ServerSideEncryption: 'AES256',
      ACL: 'public-read', // ✅ THÊM DÒNG NÀY để file public
      Metadata: metadata,
    });

    const startTime = Date.now();
    await client.send(command);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    console.log(`✅ S3 upload success in ${elapsed}s`);
    console.log(`   Public URL: ${url}`);

    return {
      success: true,
      url,
      key,
      bucket: process.env.AWS_S3_BUCKET!,
      size: buffer.length,
    };
  } catch (error: any) {
    console.error('❌ S3 Upload Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload to S3',
    };
  }
}
// ✅ Upload encrypted file to S3
export async function uploadEncryptedFileToS3(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  metadata: {
    iv: string;
    authTag: string;
    original_size: string;
    encrypted_size: string;
  }
): Promise<S3UploadResult> {
  return uploadToS3(
    buffer,
    fileName,
    fileType,
    'encrypted_files',
    metadata
  );
}

// ✅ Generate presigned URL for downloading
export async function getS3PresignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const client = getS3Client();
    
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    
    return signedUrl;
  } catch (error: any) {
    console.error('❌ S3 Presigned URL Error:', error);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
}

// ✅ Download file from S3
export async function downloadFromS3(key: string): Promise<Buffer> {
  try {
    const client = getS3Client();
    
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
    });

    const response = await client.send(command);
    
    const stream = response.Body as any;
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error: any) {
    console.error('❌ S3 Download Error:', error);
    throw new Error(`Failed to download from S3: ${error.message}`);
  }
}

// ✅ Delete file from S3
export async function deleteFromS3(key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
    });

    await client.send(command);
    console.log(`✅ File deleted from S3: ${key}`);
    
    return true;
  } catch (error: any) {
    console.error('❌ S3 Delete Error:', error);
    return false;
  }
}

// =============================================
// ✅ NEW FUNCTIONS - STREAMING UPLOAD SUPPORT
// =============================================

/**
 * 🆕 Generate presigned URLs for multipart upload
 * Client sẽ upload trực tiếp từng chunk lên S3
 * 
 * @param conversationId - ID của conversation
 * @param uploadId - Unique upload ID
 * @param totalChunks - Tổng số chunks
 * @param fileType - MIME type của file
 * @returns Array of presigned URLs (1 URL per chunk)
 */
export async function generateMultipartUploadUrls(
  conversationId: string,
  uploadId: string,
  totalChunks: number,
  fileType: string
): Promise<string[]> {
  try {
    console.log(`🔑 [Multipart] Generating ${totalChunks} presigned URLs...`);
    console.log(`   Upload ID: ${uploadId}`);
    console.log(`   Conversation: ${conversationId}`);

    const client = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET!;
    
    // ✅ Create unique key for this upload
    const timestamp = Date.now();
    const key = `encrypted/${conversationId}/${uploadId}/${timestamp}.enc`;

    // ✅ Initiate multipart upload
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType || 'application/octet-stream',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'upload-id': uploadId,
        'conversation-id': conversationId,
        'total-chunks': totalChunks.toString(),
      },
    });

    const createResponse = await client.send(createCommand);
    const s3UploadId = createResponse.UploadId!;

    console.log(`✅ [Multipart] S3 upload initiated: ${s3UploadId}`);
    console.log(`   Key: ${key}`);

    // ✅ CRITICAL: Store S3 upload info in session
    const updated = uploadSessionStore.updateS3Info(uploadId, s3UploadId, key);
    if (!updated) {
      // If session not found, abort S3 upload
      console.error(`❌ Session not found for uploadId: ${uploadId}`);
      try {
        await client.send(new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: s3UploadId,
        }));
        console.log(`✅ Aborted S3 upload due to missing session`);
      } catch (e) {
        console.error('❌ Failed to abort S3 upload:', e);
      }
      throw new Error('Upload session not found. Please restart upload.');
    }

    // ✅ Generate presigned URL for each part
    const uploadUrls: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const uploadPartCommand = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: s3UploadId,
        PartNumber: i + 1, // Part numbers start at 1
      });

      // ✅ Generate presigned URL (valid for 2 hours)
      const presignedUrl = await getSignedUrl(
        client,
        uploadPartCommand,
        { expiresIn: 7200 }
      );

      uploadUrls.push(presignedUrl);

      // Log progress every 100 URLs
      if ((i + 1) % 100 === 0 || (i + 1) === totalChunks) {
        console.log(`   Generated ${i + 1}/${totalChunks} URLs`);
      }
    }

    console.log(`✅ [Multipart] Generated ${uploadUrls.length} presigned URLs`);
    console.log(`   URLs expire in: 2 hours`);

    return uploadUrls;

  } catch (error: any) {
    console.error('❌ [Multipart] Failed to generate URLs:', error);
    throw new Error(`Failed to generate upload URLs: ${error.message}`);
  }
}

/**
 * 🆕 Complete multipart upload
 * Gộp tất cả các parts thành 1 file hoàn chỉnh
 * 
 * @param uploadId - Upload ID từ init
 * @param etags - Array of ETags từ S3 responses
 * @returns Upload result
 */
export async function completeMultipartUpload(
  uploadId: string,
  etags: string[]
): Promise<S3UploadResult> {
  try {
    console.log(`🏁 [Multipart] Completing upload: ${uploadId}`);
    console.log(`   Parts: ${etags.length}`);

    // ✅ Get upload info from session store
    const session = uploadSessionStore.get(uploadId);
    
    if (!session) {
      throw new Error(
        'Upload session not found. Session may have expired.'
      );
    }

    if (!session.s3UploadId || !session.s3Key) {
      throw new Error(
        'S3 upload info not found in session. Please restart upload.'
      );
    }

    const { s3UploadId, s3Key, totalChunks } = session;

    console.log(`✅ [Multipart] Found session with S3 info`);
    console.log(`   S3 Upload ID: ${s3UploadId}`);
    console.log(`   S3 Key: ${s3Key}`);

    // ✅ Verify all parts uploaded
    if (etags.length !== totalChunks) {
      throw new Error(
        `Expected ${totalChunks} parts, received ${etags.length}`
      );
    }

    console.log(`✅ [Multipart] All ${totalChunks} parts confirmed`);

    const client = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET!;

    // ✅ Build parts array
    const parts = etags.map((etag, index) => ({
      ETag: etag.replace(/"/g, ''), // Remove quotes if present
      PartNumber: index + 1,
    }));

    // ✅ Complete multipart upload
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: s3Key,
      UploadId: s3UploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    const startTime = Date.now();
    const response = await client.send(completeCommand);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ [Multipart] Upload completed in ${elapsed}s`);

    // ✅ Generate file URL
    const url = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    // ✅ Get file size
    let fileSize = 0;
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });
      const headResponse = await client.send(headCommand);
      fileSize = headResponse.ContentLength || 0;
      console.log(`   File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      console.warn('⚠️ Failed to get file size:', error);
    }

    console.log(`✅ [Multipart] Upload successful`);
    console.log(`   URL: ${url}`);

    return {
      success: true,
      url,
      key: s3Key,
      bucket,
      size: fileSize,
    };

  } catch (error: any) {
    console.error('❌ [Multipart] Failed to complete upload:', error);

    // ✅ Attempt to abort upload on error
    try {
      await abortMultipartUpload(uploadId);
    } catch (abortError) {
      console.error('⚠️ Failed to abort upload:', abortError);
    }

    return {
      success: false,
      error: error.message || 'Failed to complete multipart upload',
    };
  }
}

/**
 * 🆕 Abort multipart upload
 * Cleanup khi có lỗi hoặc user cancel
 * 
 * @param uploadId - Upload ID to abort
 * @returns Success status
 */
export async function abortMultipartUpload(uploadId: string): Promise<boolean> {
  try {
    console.log(`🗑️  [Multipart] Aborting upload: ${uploadId}`);

    const session = uploadSessionStore.get(uploadId);
    
    if (!session || !session.s3UploadId || !session.s3Key) {
      console.log('⚠️ Upload info not found in session, may already be cleaned');
      return false;
    }

    const { s3UploadId, s3Key } = session;
    const client = getS3Client();

    const abortCommand = new AbortMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: s3Key,
      UploadId: s3UploadId,
    });

    await client.send(abortCommand);
    
    console.log(`✅ [Multipart] S3 upload aborted: ${uploadId}`);
    return true;

  } catch (error: any) {
    console.error('❌ [Multipart] Failed to abort upload:', error);
    return false;
  }
}

/**
 * 🆕 Check if file exists in S3
 * 
 * @param key - S3 object key
 * @returns true if file exists
 */
export async function checkS3FileExists(key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    
    const command = new HeadObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
    });
    
    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error('❌ Error checking file existence:', error);
    throw error;
  }
}

// =============================================
// ✅ EXPORTS
// =============================================

export {
  getS3Client,
};