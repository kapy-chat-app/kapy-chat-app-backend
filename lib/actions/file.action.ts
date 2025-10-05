/* eslint-disable @typescript-eslint/no-explicit-any */
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
        { fetch_format: "auto" }
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

    const uploadResult = await cloudinary.uploader.upload(dataURI, uploadOptions);

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
    } else if (file.file_type.startsWith("video/") || file.file_type.startsWith("audio/")) {
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