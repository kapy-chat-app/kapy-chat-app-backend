// src/actions/file.actions.ts
import { FileRes } from "@/dtos/file.dto";
import { v2 as cloudinary } from "cloudinary";
import { connectToDatabase } from "../mongoose";
import console from "console";
import File from "@/database/file.model";

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Kiểm tra cấu hình Cloudinary
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

// Interface cho file upload
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

/**
 * Upload file lên Cloudinary và lưu vào database
 * @param file - File object từ FormData
 * @param folder - Thư mục lưu trữ trên Cloudinary (default: 'chatapp')
 * @param userId - ID của user upload (optional, for logging)
 * @returns Promise<FileUploadResult>
 */
export const uploadFileToCloudinary = async (
  file: File,
  folder: string = "chatapp",
  userId?: string
): Promise<FileUploadResult> => {
  try {
    console.log(
      `🚀 Starting file upload for: ${file.name}, size: ${file.size} bytes`
    );

    // Validate Cloudinary config
    validateCloudinaryConfig();

    // Connect to database
    await connectToDatabase();
    console.log("✅ Connected to database");

    // Validate file
    if (!file || file.size === 0) {
      throw new Error("Invalid file: File is empty or undefined");
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error("File size exceeds 10MB limit");
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/mov",
      "video/avi",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/aac",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed`);
    }

    console.log("✅ File validation passed");

    // Convert File to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`✅ File converted to buffer, size: ${buffer.length} bytes`);

    // Create base64 data URI
    const base64String = buffer.toString("base64");
    const dataURI = `data:${file.type};base64,${base64String}`;

    // Determine resource type for Cloudinary
    let resourceType: "image" | "video" | "raw" = "raw";
    if (file.type.startsWith("image/")) {
      resourceType = "image";
    } else if (file.type.startsWith("video/")) {
      resourceType = "video";
    }

    // Generate unique public_id
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2);
    const fileNameWithoutExt = file.name
      .split(".")[0]
      .replace(/[^a-zA-Z0-9]/g, "_");
    const publicId = `${timestamp}_${randomString}_${fileNameWithoutExt}`;

    console.log(`📤 Uploading to Cloudinary with public_id: ${publicId}`);

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(dataURI, {
      folder: folder,
      resource_type: resourceType,
      public_id: publicId,
      // Additional options based on file type
      ...(resourceType === "image" && {
        transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
      }),
      ...(resourceType === "video" && {
        video_codec: "auto",
        quality: "auto:good",
      }),
    });

    console.log(
      `✅ Cloudinary upload successful, secure_url: ${uploadResult.secure_url}`
    );

    // Save file metadata to database
    const fileData = {
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      file_path: uploadResult.public_id, // Store Cloudinary public_id
      url: uploadResult.secure_url,
    };

    console.log("💾 Saving file metadata to database...");
    const savedFile = await File.create(fileData);
    console.log(`✅ File saved to database with ID: ${savedFile._id}`);

    // Prepare response
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

/**
 * Xóa file từ Cloudinary và database
 * @param fileId - ID của file trong database
 * @returns Promise<FileDeleteResult>
 */
export const deleteFileFromCloudinary = async (
  fileId: string
): Promise<FileDeleteResult> => {
  try {
    console.log(`🗑️ Starting file deletion for ID: ${fileId}`);

    // Validate Cloudinary config
    validateCloudinaryConfig();

    // Connect to database
    await connectToDatabase();

    // Find file in database
    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found in database");
    }

    console.log(
      `📁 Found file: ${file.file_name}, public_id: ${file.file_path}`
    );

    // Determine resource type for deletion
    let resourceType: "image" | "video" | "raw" = "raw";
    if (file.file_type.startsWith("image/")) {
      resourceType = "image";
    } else if (file.file_type.startsWith("video/")) {
      resourceType = "video";
    }

    // Delete from Cloudinary
    console.log(
      `🌥️ Deleting from Cloudinary with resource_type: ${resourceType}`
    );
    const deleteResult = await cloudinary.uploader.destroy(file.file_path, {
      resource_type: resourceType,
    });

    console.log(`Cloudinary deletion result:`, deleteResult);

    // Check if deletion was successful
    if (deleteResult.result !== "ok" && deleteResult.result !== "not found") {
      throw new Error(
        `Cloudinary deletion failed: ${JSON.stringify(deleteResult)}`
      );
    }

    // Delete from database
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

/**
 * Lấy thông tin file theo ID
 * @param fileId - ID của file
 * @returns Promise<FileUploadResult>
 */
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

/**
 * Upload multiple files
 * @param files - Array of File objects
 * @param folder - Thư mục lưu trữ
 * @param userId - ID của user upload
 * @returns Promise<{ successful: FileRes[], failed: { file: string, error: string }[] }>
 */
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

/**
 * Lấy danh sách files theo type
 * @param fileType - Loại file (image/, video/, audio/, etc.)
 * @param limit - Số lượng files
 * @param page - Trang
 * @returns Promise<FileRes[]>
 */
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
