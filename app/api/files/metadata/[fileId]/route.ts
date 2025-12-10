/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/files/metadata/[fileId]/route.ts - FIXED AUTH

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import File from "@/database/file.model";
import User from "@/database/user.model";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    
    // ✅ Get auth - với better error handling
    let clerkUserId: string | null = null;
    try {
      const authResult = await auth();
      clerkUserId = authResult.userId;
    } catch (authError) {
      console.error("❌ [Metadata API] Auth error:", authError);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    if (!clerkUserId) {
      console.log("❌ [Metadata API] No userId from auth");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`📄 [Metadata API] Request for file: ${fileId}`);
    console.log(`   User: ${clerkUserId}`);

    await connectToDatabase();

    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      console.log("❌ [Metadata API] User not found in database");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ✅ Get file with encryption metadata
    const file = await File.findById(fileId);
    if (!file) {
      console.log("❌ [Metadata API] File not found");
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    console.log(`📄 [Metadata API] File: ${file.file_name}`);
    console.log(`   Encrypted: ${file.is_encrypted}`);
    console.log(`   Chunks: ${file.encryption_metadata?.chunks?.length || 0}`);

    // ✅ TEMPORARY: Allow access to all files for testing
    // TODO: Re-enable access check after implementing recipientKeys
    const hasRecipientKeys = file.encryption_metadata?.recipientKeys && 
                             Array.isArray(file.encryption_metadata.recipientKeys);

    if (hasRecipientKeys) {
      // ✅ NEW SYSTEM: Check if user has access via recipientKeys
      const hasAccess = file.encryption_metadata.recipientKeys.some(
        (rk: any) => rk.userId === clerkUserId
      );

      if (!hasAccess) {
        console.log(`❌ [Metadata API] User ${clerkUserId} has no access to file ${fileId}`);
        console.log(`   Available keys for:`, file.encryption_metadata.recipientKeys.map((r: any) => r.userId));
        return NextResponse.json(
          { error: "You do not have access to this file" },
          { status: 403 }
        );
      }

      console.log(`✅ [Metadata API] User ${clerkUserId} has access (NEW SYSTEM)`);
    } else {
      // ✅ OLD SYSTEM: Allow access for backward compatibility
      console.log(`⚠️ [Metadata API] Old file format - allowing access for backward compatibility`);
    }

    // ✅ Return metadata
    const response = {
      success: true,
      data: {
        fileId: file._id.toString(),
        fileName: file.file_name,
        fileType: file.file_type,
        fileSize: file.file_size,
        url: file.url,
        isEncrypted: file.is_encrypted,
        thumbnailUrl: file.thumbnail_url,
        encryptionMetadata: file.encryption_metadata ? {
          iv: file.encryption_metadata.iv,
          authTag: file.encryption_metadata.authTag,
          originalSize: file.encryption_metadata.original_size,
          encryptedSize: file.encryption_metadata.encrypted_size,
          totalChunks: file.encryption_metadata.totalChunks,
          chunks: file.encryption_metadata.chunks,
          recipientKeys: file.encryption_metadata.recipientKeys || [], // ✅ Include recipientKeys
          fileId: file.encryption_metadata.fileId,
        } : null,
        createdAt: file.created_at,
      },
    };

    console.log(`✅ [Metadata API] Returning metadata`);
    console.log(`   Recipients: ${file.encryption_metadata?.recipientKeys?.length || 0}`);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("❌ [Metadata API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch file metadata",
      },
      { status: 500 }
    );
  }
}