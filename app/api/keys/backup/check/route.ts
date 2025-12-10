// src/app/api/keys/backup/check/route.ts - FIXED
import User from "@/database/user.model";
import { connectToDatabase } from "@/lib/mongoose";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * GET /api/keys/backup/check
 * Check if user has encryption backup (without returning the backup data)
 */
export async function GET() {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { 
          success: false,
          error: "Unauthorized" 
        }, 
        { status: 401 }
      );
    }

    const user = await User.findOne({ clerkId: userId });
    
    if (!user) {
      return NextResponse.json(
        { 
          success: false,
          error: "User not found" 
        }, 
        { status: 404 }
      );
    }

    // ✅ Check if backup exists
    const hasBackup = !!(user.encryption_backup && 
                        user.encryption_backup.encryptedMasterKey);

    console.log(`📊 Backup check for user ${userId}: ${hasBackup}`);

    // ✅ Return correct format
    return NextResponse.json({
      success: true,
      data: {
        hasBackup,  // ← This is what frontend expects!
        createdAt: user.encryption_backup_created_at || null,
      },
    });

  } catch (error) {
    console.error("❌ Error checking backup:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to check backup",
      },
      { status: 500 }
    );
  }
}