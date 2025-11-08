/* eslint-disable @typescript-eslint/prefer-as-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/actions/file.actions.ts
import { FileRes } from "@/dtos/file.dto";
import { v2 as cloudinary } from "cloudinary";
import { connectToDatabase } from "../mongoose";
import console from "console";
import File from "@/database/file.model";
import { auth } from "@clerk/nextjs/server";
import User from "@/database/user.model";
import crypto from 'crypto';
import Message from "@/database/message.model";

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const validateCloudinaryConfig = () => {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error(
      "Missing Cloudinary configuration. Please check your environment variables."
    );
  }
};

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

export const uploadFileToCloudinary = async (
  file: File,
  folder: string = "chatapp",
  userId?: string
): Promise<FileUploadResult> => {
  try {
    console.log(
      `🚀 Starting file upload for: ${file.name}, size: ${file.size} bytes`
    );

    validateCloudinaryConfig();
    await connectToDatabase();
    console.log("✅ Connected to database");

    if (!file || file.size === 0) {
      throw new Error("Invalid file: File is empty or undefined");
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error("File size exceeds 10MB limit");
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

    const base64String = buffer.toString("base64");
    const dataURI = `data:${file.type};base64,${base64String}`;

    // ✅ Xác định resource type
    let resourceType: "image" | "video" | "raw" = "raw";
    const isAudio = file.type.startsWith("audio/");

    if (file.type.startsWith("image/")) {
      resourceType = "image";
    } else if (file.type.startsWith("video/") || isAudio) {
      // ✅ Audio files cần upload với resource_type = "video"
      resourceType = "video";
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2);
    const fileNameWithoutExt = file.name
      .split(".")[0]
      .replace(/[^a-zA-Z0-9]/g, "_");
    const publicId = `${timestamp}_${randomString}_${fileNameWithoutExt}`;

    console.log(`📤 Uploading to Cloudinary with public_id: ${publicId}`);

    // ✅ Upload với config phù hợp
    const uploadOptions: any = {
      folder: folder,
      resource_type: resourceType,
      public_id: publicId,
    };

    // Image transformations
    if (resourceType === "image") {
      uploadOptions.transformation = [
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ];
    }

    // Video transformations
    if (resourceType === "video" && !isAudio) {
      uploadOptions.video_codec = "auto";
      uploadOptions.quality = "auto:good";
    }

    // ✅ Audio conversion sang MP3
    if (isAudio) {
      uploadOptions.format = "mp3"; // Convert sang MP3
      uploadOptions.resource_type = "video"; // Required for audio
    }

    const uploadResult = await cloudinary.uploader.upload(
      dataURI,
      uploadOptions
    );

    console.log(
      `✅ Cloudinary upload successful, secure_url: ${uploadResult.secure_url}`
    );

    // ✅ Lưu với file_type đúng (vẫn giữ original type)
    const fileData = {
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      file_path: uploadResult.public_id,
      url: uploadResult.secure_url,
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

export const deleteFileFromCloudinary = async (
  fileId: string
): Promise<FileDeleteResult> => {
  try {
    console.log(`🗑️ Starting file deletion for ID: ${fileId}`);

    validateCloudinaryConfig();
    await connectToDatabase();

    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found in database");
    }

    console.log(
      `📁 Found file: ${file.file_name}, public_id: ${file.file_path}`
    );

    // ✅ Xác định resource type cho deletion
    let resourceType: "image" | "video" | "raw" = "raw";
    if (file.file_type.startsWith("image/")) {
      resourceType = "image";
    } else if (
      file.file_type.startsWith("video/") ||
      file.file_type.startsWith("audio/")
    ) {
      resourceType = "video"; // Audio cũng dùng "video"
    }

    console.log(
      `🌥️ Deleting from Cloudinary with resource_type: ${resourceType}`
    );
    const deleteResult = await cloudinary.uploader.destroy(file.file_path, {
      resource_type: resourceType,
    });

    console.log(`Cloudinary deletion result:`, deleteResult);

    if (deleteResult.result !== "ok" && deleteResult.result !== "not found") {
      throw new Error(
        `Cloudinary deletion failed: ${JSON.stringify(deleteResult)}`
      );
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
      const result = await uploadFileToCloudinary(file, folder, userId);

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

/**
 * ✨ UPDATED: Upload encrypted file to Cloudinary ONLY
 * Không lưu encrypted_data vào MongoDB
 */
export async function uploadEncryptedFileToCloudinary(
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

    console.log("File AuthTag>>>",encryptionMetadata.authTag); 

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    console.log("📤 Uploading encrypted file to Cloudinary:", {
      fileName: originalFileName,
      encryptedSize: encryptionMetadata.encrypted_size,
      originalSize: encryptionMetadata.original_size,
    });

    // ✅ Validate encrypted data
    if (!encryptedBase64 || encryptedBase64.length === 0) {
      throw new Error("Encrypted data is empty");
    }

    // ✅ Upload encrypted data lên Cloudinary với access_mode: authenticated
    const uploadResult = await cloudinary.uploader.upload(
      `data:application/octet-stream;base64,${encryptedBase64}`,
      {
        resource_type: "raw",
        folder: "encrypted_files",
        public_id: `${Date.now()}_${originalFileName.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}`,
        transformation: [],
        access_mode: "authenticated", // ✅ QUAN TRỌNG: Chỉ access qua signed URL
        type: "authenticated", // ✅ Set type để Cloudinary biết đây là authenticated resource
        flags: "attachment"
      }
    );

    console.log("✅ Encrypted file uploaded to Cloudinary:", {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      type: uploadResult.type,
    });

    // ✅ CHỈ lưu metadata + Cloudinary URL vào DB
    const file = await File.create({
      file_name: originalFileName,
      file_type: originalFileType,
      file_size: encryptionMetadata.encrypted_size,
      file_path: uploadResult.public_id, // ✅ Lưu public_id thay vì URL
      url: uploadResult.secure_url,
      cloudinary_public_id: uploadResult.public_id,
      is_encrypted: true,
      // ❌ KHÔNG LƯU encrypted_data
      encryption_metadata: {
        iv: encryptionMetadata.iv,
        authTag: encryptionMetadata.authTag,
        original_size: encryptionMetadata.original_size,
        encrypted_size: encryptionMetadata.encrypted_size,
      },
      uploaded_by: user._id,
    });

    console.log("✅ File metadata saved to database:", {
      fileId: file._id,
      cloudinaryId: file.cloudinary_public_id,
      isEncrypted: file.is_encrypted,
    });

    return {
      success: true,
      data: {
        fileId: file._id.toString(),
        url: uploadResult.secure_url,
        fileName: originalFileName,
        fileType: originalFileType,
        fileSize: encryptionMetadata.encrypted_size,
      },
      file: {
        id: file._id.toString(),
        name: originalFileName,
        type: originalFileType,
        size: encryptionMetadata.encrypted_size,
        url: uploadResult.secure_url,
      },
    };
  } catch (error) {
    console.error("❌ Error uploading encrypted file:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * ✨ UPDATED: Generate signed URL for encrypted file from Cloudinary
 * URL có thời hạn 1 giờ
 */
export const generateSignedFileUrl = async (
  fileId: string,
  userId: string // Clerk userId
): Promise<{ success: boolean; signedUrl?: string; metadata?: any; error?: string }> => {
  try {
    await connectToDatabase();

    const file = await File.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    // ✅ Non-encrypted files trả về URL thông thường
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

    console.log('🔐 Generating signed URL for encrypted file:', file.file_name);


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

    // ✅ Check if user is participant
    const conversation = message.conversation as any;
    const isParticipant = conversation.participants.some(
      (p: any) => p.clerkId === userId
    );

    if (!isParticipant) {
      throw new Error('Unauthorized to access this file');
    }

    // ✅ Generate signed URL với expiration (1 hour)
    const timestamp = Math.floor(Date.now() / 1000) + 3600; // Expire in 1 hour
    
    // ✅ FIXED: Generate signature cho authenticated resource
    const apiSecret = process.env.CLOUDINARY_API_SECRET!;
    const stringToSign = `public_id=${file.cloudinary_public_id}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto
      .createHash('sha256')
      .update(stringToSign)
      .digest('hex');

    // ✅ Build signed URL
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const signedUrl = `https://res.cloudinary.com/${cloudName}/raw/authenticated/v1/${file.cloudinary_public_id}?timestamp=${timestamp}&signature=${signature}&api_key=${apiKey}`;

    console.log('✅ Generated signed URL (expires in 1h)');

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
    console.error('❌ Failed to generate signed URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate URL',
    };
  }
};

/**
 * ✅ FIXED: Download encrypted file from Cloudinary
 * Sử dụng config pattern giống như uploadFileToCloudinary
 */
export async function downloadEncryptedFile(fileId: string, clerkUserId: string) {
  try {
    console.log(`\n📥 [DOWNLOAD DEBUG] Starting encrypted file download for ID: ${fileId}`);

    validateCloudinaryConfig();
    await connectToDatabase();
    console.log("✅ [DOWNLOAD DEBUG] Connected to MongoDB");

    // 🧩 User validation
    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) throw new Error("User not found");
    console.log(`👤 [DOWNLOAD DEBUG] Authenticated user: ${user.clerkId}`);

    // 🗂️ File lookup
    const file = await File.findById(fileId);
    if (!file) return { success: false, error: "File not found" };
    if (!file.is_encrypted)
      return { success: false, error: "File is not encrypted. Use normal download." };

    console.log("📁 [DOWNLOAD DEBUG] Found encrypted file:", {
      fileName: file.file_name,
      publicId: file.cloudinary_public_id,
      type: file.file_type,
      size: file.file_size,
      hasMetadata: !!file.encryption_metadata,
    });

    // 🧑‍🤝‍🧑 Verify access
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

    console.log("✅ [DOWNLOAD DEBUG] User authorized to access file");

    // 🌥️ Cloudinary fetch
    const resourceType: "raw" = "raw";
    console.log(
      `🌩️ [CLOUDINARY INFO] Requesting resource: ${file.cloudinary_public_id} (type=authenticated, resource_type=${resourceType})`
    );

    try {
      const resource = await cloudinary.api.resource(file.cloudinary_public_id, {
        resource_type: resourceType,
        type: "authenticated",
      });

      console.log("✅ [CLOUDINARY INFO] Resource metadata fetched:", {
        public_id: resource.public_id,
        bytes: resource.bytes,
        created_at: resource.created_at,
      });

      // 📦 Download file content
      console.log(`📥 [DOWNLOAD DEBUG] Fetching encrypted content from secure_url...`);
      const response = await fetch(resource.secure_url);
      if (!response.ok)
        throw new Error(`Download failed: ${response.statusText} (${response.status})`);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");

      // 🔍 Integrity check
      const hashDownloaded = crypto.createHash("sha256").update(buffer).digest("hex");

      console.log("🔍 [INTEGRITY CHECK] Download completed:");
      console.log(`   - Base64 length: ${base64.length}`);
      console.log(`   - Base64 prefix: ${base64.slice(0, 80)}...`);
      console.log(`   - SHA256 hash (downloaded): ${hashDownloaded}`);

      if (file.encryption_metadata?.hash) {
        console.log(
          `   - SHA256 (original in DB): ${file.encryption_metadata.hash}`
        );
        if (hashDownloaded !== file.encryption_metadata.hash) {
          console.warn(
            "⚠️ [INTEGRITY WARNING] File differs from original upload! Possible Cloudinary transformation."
          );
        } else {
          console.log("✅ [INTEGRITY CHECK] File hash matches original upload.");
        }
      }

      console.log("🎉 [DOWNLOAD DEBUG] Encrypted file downloaded successfully.");
      return {
        success: true,
        data: {
          encryptedData: base64,
          encryptionMetadata: file.encryption_metadata,
          fileName: file.file_name,
          fileType: file.file_type,
          downloadedHash: hashDownloaded,
        },
      };
    } catch (cloudinaryError) {
      console.error("❌ [CLOUDINARY ERROR] Admin API failed:", cloudinaryError);
      console.log("⚠️ [FALLBACK] Using signed URL to fetch encrypted data...");

      // 🧾 Generate fallback signed URL
      const timestamp = Math.floor(Date.now() / 1000) + 3600;
      const apiSecret = process.env.CLOUDINARY_API_SECRET!;
      const stringToSign = `public_id=${file.cloudinary_public_id}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto.createHash("sha256").update(stringToSign).digest("hex");

      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const signedUrl = `https://res.cloudinary.com/${cloudName}/raw/authenticated/v1/${file.cloudinary_public_id}?timestamp=${timestamp}&signature=${signature}&api_key=${apiKey}`;

      console.log("🔑 [FALLBACK] Generated signed URL:", signedUrl);

      // 🪂 Download via signed URL
      const response = await fetch(signedUrl);
      if (!response.ok)
        throw new Error(`Signed URL download failed: ${response.statusText}`);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const hashDownloaded = crypto.createHash("sha256").update(buffer).digest("hex");

      console.log("🔍 [FALLBACK INTEGRITY CHECK]:");
      console.log(`   - Base64 length: ${base64.length}`);
      console.log(`   - Base64 prefix: ${base64.slice(0, 80)}...`);
      console.log(`   - SHA256 hash: ${hashDownloaded}`);

      console.log("✅ [FALLBACK] Encrypted file downloaded via signed URL.");

      return {
        success: true,
        data: {
          encryptedData: base64,
          encryptionMetadata: file.encryption_metadata,
          fileName: file.file_name,
          fileType: file.file_type,
          downloadedHash: hashDownloaded,
        },
      };
    }
  } catch (error) {
    console.error("❌ [DOWNLOAD ERROR] Encrypted file download failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Download failed",
    };
  }
}
/**
 * ✨ UPDATED: Delete encrypted file from Cloudinary
 */
export const deleteEncryptedFileFromCloudinary = async (
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

    console.log("🌥️ Deleting authenticated resource from Cloudinary...");

    // ✅ Delete từ Cloudinary với type="authenticated"
    const deleteResult = await cloudinary.uploader.destroy(
      file.cloudinary_public_id!,
      {
        resource_type: "raw",
        type: "authenticated", // ✅ QUAN TRỌNG
        invalidate: true,
      }
    );

    console.log("Cloudinary deletion result:", deleteResult);

    if (deleteResult.result !== "ok" && deleteResult.result !== "not found") {
      throw new Error(
        `Cloudinary deletion failed: ${JSON.stringify(deleteResult)}`
      );
    }

    // ✅ Delete from DB
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
