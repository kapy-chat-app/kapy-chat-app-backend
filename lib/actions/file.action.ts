/* eslint-disable @typescript-eslint/prefer-as-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/file.action.ts
import { FileRes } from "@/dtos/file.dto";
import { connectToDatabase } from "../mongoose";
import console from "console";
import File from "@/database/file.model";
import { auth } from "@clerk/nextjs/server";
import User from "@/database/user.model";
import Message from "@/database/message.model";
// ✅ S3 imports
import { 
  uploadToS3, 
  uploadEncryptedFileToS3 as uploadEncryptedToS3, 
  deleteFromS3, 
  downloadFromS3, 
  getS3PresignedUrl 
} from "@/lib/s3";

export interface FileUploadResult {
  success: boolean;
  file?: FileRes;
  error?: string;
}

export interface FileDeleteResult {
  success: boolean;
  message?: string;
  error?: string;
}

// ✅ Upload regular file to cloud storage (S3)
export const uploadFileToCloud = async (
  file: File,
  folder: string = "chatapp",
  userId?: string
): Promise<FileUploadResult> => {
  try {
    console.log(
      `🚀 Starting file upload for: ${file.name}, size: ${file.size} bytes`
    );

    await connectToDatabase();
    console.log("✅ Connected to database");

    if (!file || file.size === 0) {
      throw new Error("Invalid file: File is empty or undefined");
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      throw new Error("File size exceeds 100MB limit");
    }

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      "video/mp4",
      "video/webm",
      "video/mov",
      "video/quicktime",
      "video/avi",
      "audio/mp3",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/aac",
      "audio/m4a",
      "audio/x-m4a",
      "audio/mp4",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed`);
    }

    console.log("✅ File validation passed");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`✅ File converted to buffer, size: ${buffer.length} bytes`);

    // ✅ Upload to S3
    const uploadResult = await uploadToS3(
      buffer,
      file.name,
      file.type,
      folder
    );

    if (!uploadResult.success) {
      throw new Error(`Cloud storage upload failed: ${uploadResult.error}`);
    }

    console.log(
      `✅ Cloud storage upload successful, url: ${uploadResult.url}`
    );

    // ✅ Save to database
    const fileData = {
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      file_path: uploadResult.key!,
      url: uploadResult.url!,
      cloudinary_public_id: uploadResult.key, // Reuse field for storage key
    };

    console.log("💾 Saving file metadata to database...");
    const savedFile = await File.create(fileData);
    console.log(`✅ File saved to database with ID: ${savedFile._id}`);

    const fileResponse: FileRes = {
      id: savedFile._id.toString(),
      file_name: savedFile.file_name,
      file_type: savedFile.file_type,
      file_size: savedFile.file_size,
      file_path: savedFile.file_path,
      url: savedFile.url,
      created_at: savedFile.created_at,
    };

    console.log("🎉 File upload completed successfully");

    return {
      success: true,
      file: fileResponse,
    };
  } catch (error) {
    console.error("❌ File upload error:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error occurred during file upload",
    };
  }
};

// ✅ Delete regular file from cloud storage (S3)
export const deleteFileFromCloud = async (
  fileId: string
): Promise<FileDeleteResult> => {
  try {
    console.log(`🗑️ Starting file deletion for ID: ${fileId}`);

    await connectToDatabase();

    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found in database");
    }

    console.log(
      `📁 Found file: ${file.file_name}, storage_key: ${file.file_path}`
    );

    console.log(`☁️ Deleting from cloud storage...`);
    const deleted = await deleteFromS3(file.file_path);

    if (!deleted) {
      console.warn("⚠️ Cloud storage deletion failed, but continuing with DB deletion");
    }

    console.log("🗄️ Deleting from database...");
    await File.findByIdAndDelete(fileId);
    console.log("✅ File deleted from database");

    console.log("🎉 File deletion completed successfully");

    return {
      success: true,
      message: `File "${file.file_name}" deleted successfully`,
    };
  } catch (error) {
    console.error("❌ File deletion error:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error occurred during file deletion",
    };
  }
};

export const getFileById = async (
  fileId: string
): Promise<FileUploadResult> => {
  try {
    await connectToDatabase();

    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    const fileResponse: FileRes = {
      id: file._id.toString(),
      file_name: file.file_name,
      file_type: file.file_type,
      file_size: file.file_size,
      file_path: file.file_path,
      url: file.url,
      created_at: file.created_at,
    };

    return {
      success: true,
      file: fileResponse,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch file",
    };
  }
};

export const uploadMultipleFiles = async (
  files: File[],
  folder: string = "chatapp",
  userId?: string
): Promise<{
  successful: FileRes[];
  failed: { fileName: string; error: string }[];
}> => {
  const successful: FileRes[] = [];
  const failed: { fileName: string; error: string }[] = [];

  console.log(`📤 Starting bulk upload of ${files.length} files`);

  for (const file of files) {
    try {
      const result = await uploadFileToCloud(file, folder, userId);

      if (result.success && result.file) {
        successful.push(result.file);
      } else {
        failed.push({
          fileName: file.name,
          error: result.error || "Unknown error",
        });
      }
    } catch (error) {
      failed.push({
        fileName: file.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  console.log(
    `✅ Bulk upload completed: ${successful.length} successful, ${failed.length} failed`
  );

  return { successful, failed };
};

export const getFilesByType = async (
  fileType: string,
  limit: number = 20,
  page: number = 1
): Promise<FileRes[]> => {
  try {
    await connectToDatabase();

    const skip = (page - 1) * limit;

    const files = await File.find({
      file_type: { $regex: new RegExp(`^${fileType}`), $options: "i" },
    })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    return files.map((file) => ({
      id: file._id.toString(),
      file_name: file.file_name,
      file_type: file.file_type,
      file_size: file.file_size,
      file_path: file.file_path,
      url: file.url,
      created_at: file.created_at,
    }));
  } catch (error) {
    console.error("Error fetching files by type:", error);
    return [];
  }
};

// ✅ Upload encrypted file to cloud storage (S3)
export async function uploadEncryptedFile(
  encryptedBase64: string,
  originalFileName: string,
  originalFileType: string,
  encryptionMetadata: {
    iv: string;
    authTag: string;
    original_size: number;
    encrypted_size: number;
  }
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    console.log("📤 Uploading encrypted file to cloud storage:", {
      fileName: originalFileName,
      encryptedSize: encryptionMetadata.encrypted_size,
      originalSize: encryptionMetadata.original_size,
      sizeInMB: (encryptedBase64.length / 1024 / 1024).toFixed(2) + " MB",
    });

    if (!encryptedBase64 || encryptedBase64.length === 0) {
      throw new Error("Encrypted data is empty");
    }

    const base64Size = (encryptedBase64.length * 3) / 4;
    const maxSize = 100 * 1024 * 1024;
    
    if (base64Size > maxSize) {
      throw new Error(`Encrypted file too large: ${(base64Size / 1024 / 1024).toFixed(2)} MB. Max: 100 MB`);
    }

    console.log(`✅ Size check passed: ${(base64Size / 1024 / 1024).toFixed(2)} MB`);

    const buffer = Buffer.from(encryptedBase64, 'base64');

    const uploadResult = await uploadEncryptedToS3(
      buffer,
      originalFileName,
      originalFileType,
      {
        iv: encryptionMetadata.iv,
        authTag: encryptionMetadata.authTag,
        original_size: encryptionMetadata.original_size.toString(),
        encrypted_size: encryptionMetadata.encrypted_size.toString(),
      }
    );

    if (!uploadResult.success) {
      throw new Error(`Cloud storage upload failed: ${uploadResult.error}`);
    }

    console.log("✅ Encrypted file uploaded to cloud storage:", {
      url: uploadResult.url,
      key: uploadResult.key,
      bytes: uploadResult.size,
    });

    const file = await File.create({
      file_name: originalFileName,
      file_type: originalFileType,
      file_size: encryptionMetadata.encrypted_size,
      file_path: uploadResult.key!,
      url: uploadResult.url!,
      cloudinary_public_id: uploadResult.key,
      is_encrypted: true,
      encryption_metadata: {
        iv: encryptionMetadata.iv,
        authTag: encryptionMetadata.authTag,
        original_size: encryptionMetadata.original_size,
        encrypted_size: encryptionMetadata.encrypted_size,
      },
      uploaded_by: user._id,
    });

    console.log("✅ File metadata saved:", file._id);

    return {
      success: true,
      data: {
        fileId: file._id.toString(),
        url: uploadResult.url,
        fileName: originalFileName,
        fileType: originalFileType,
        fileSize: encryptionMetadata.encrypted_size,
      },
      file: {
        id: file._id.toString(),
        name: originalFileName,
        type: originalFileType,
        size: encryptionMetadata.encrypted_size,
        url: uploadResult.url,
      },
    };
  } catch (error) {
    console.error("❌ Error uploading encrypted file:", error);
    
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return {
          success: false,
          error: "Upload timeout. File may be too large or connection is slow.",
        };
      }
      if (error.message.includes('too large')) {
        return {
          success: false,
          error: error.message,
        };
      }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

// ✅ Generate presigned URL for file download
export const generateSignedFileUrl = async (
  fileId: string,
  userId: string
): Promise<{ success: boolean; signedUrl?: string; metadata?: any; error?: string }> => {
  try {
    await connectToDatabase();

    const file = await File.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    if (!file.is_encrypted) {
      return {
        success: true,
        signedUrl: file.url,
        metadata: {
          file_name: file.file_name,
          file_type: file.file_type,
          file_size: file.file_size,
          is_encrypted: false,
        },
      };
    }

    console.log('🔐 Generating presigned URL for encrypted file:', file.file_name);

    const message = await Message.findOne({
      attachments: fileId,
    }).populate({
      path: 'conversation',
      populate: {
        path: 'participants',
        select: 'clerkId',
      },
    });

    if (!message) {
      throw new Error('File not found in any message');
    }

    const conversation = message.conversation as any;
    const isParticipant = conversation.participants.some(
      (p: any) => p.clerkId === userId
    );

    if (!isParticipant) {
      throw new Error('Unauthorized to access this file');
    }

    const signedUrl = await getS3PresignedUrl(file.file_path, 3600);

    console.log('✅ Generated presigned URL (expires in 1h)');

    return {
      success: true,
      signedUrl,
      metadata: {
        iv: file.encryption_metadata?.iv,
        authTag: file.encryption_metadata?.authTag,
        original_size: file.encryption_metadata?.original_size,
        encrypted_size: file.encryption_metadata?.encrypted_size,
        file_name: file.file_name,
        file_type: file.file_type,
      },
    };
  } catch (error) {
    console.error('❌ Failed to generate presigned URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate URL',
    };
  }
};

// ✅ Download encrypted file from cloud storage
export async function downloadEncryptedFile(fileId: string, clerkUserId: string) {
  try {
    console.log(`\n📥 [DOWNLOAD] Starting encrypted file download for ID: ${fileId}`);

    await connectToDatabase();

    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) throw new Error("User not found");

    const file = await File.findById(fileId);
    if (!file) return { success: false, error: "File not found" };
    if (!file.is_encrypted)
      return { success: false, error: "File is not encrypted" };

    console.log("📁 Found encrypted file:", {
      fileName: file.file_name,
      storageKey: file.file_path,
      type: file.file_type,
      size: file.file_size,
    });

    const message = await Message.findOne({ attachments: fileId }).populate({
      path: "conversation",
      populate: { path: "participants", select: "clerkId" },
    });
    if (!message) throw new Error("File not found in any message");

    const conversation = message.conversation as any;
    const isParticipant = conversation.participants.some(
      (p: any) => p.clerkId === clerkUserId
    );
    if (!isParticipant) throw new Error("Unauthorized to access this file");

    console.log("✅ User authorized to access file");

    console.log(`📥 Downloading from cloud storage: ${file.file_path}`);
    const buffer = await downloadFromS3(file.file_path);
    const base64 = buffer.toString("base64");

    console.log("✅ File downloaded successfully:", {
      size: (buffer.length / 1024 / 1024).toFixed(2) + " MB",
      base64Length: base64.length,
    });

    return {
      success: true,
      data: {
        encryptedData: base64,
        encryptionMetadata: file.encryption_metadata,
        fileName: file.file_name,
        fileType: file.file_type,
      },
    };
  } catch (error) {
    console.error("❌ Download error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Download failed",
    };
  }
}

// ✅ Delete encrypted file from cloud storage
export const deleteEncryptedFile = async (
  fileId: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log(`🗑️ Deleting encrypted file ID: ${fileId}`);

    await connectToDatabase();

    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found in database");
    }

    if (!file.is_encrypted) {
      throw new Error("File is not encrypted. Use normal deletion.");
    }

    console.log("☁️ Deleting from cloud storage...");

    const deleted = await deleteFromS3(file.file_path);
    
    if (!deleted) {
      console.warn("⚠️ Cloud storage deletion failed, but continuing with DB deletion");
    }

    await File.findByIdAndDelete(fileId);
    console.log("✅ Encrypted file deleted successfully");

    return {
      success: true,
      message: `Encrypted file "${file.file_name}" deleted successfully`,
    };
  } catch (error) {
    console.error("❌ Encrypted file deletion error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete encrypted file",
    };
  }
};