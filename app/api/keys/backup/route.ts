// src/app/api/keys/backup/route.ts - FIXED for AES-GCM
import User from "@/database/user.model";
import { connectToDatabase } from "@/lib/mongoose";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// POST - Upload encrypted key backup
export async function POST(req: NextRequest) {
  try {
    console.log('📥 [Backup API] POST request received');
    
    await connectToDatabase();
    console.log('✅ [Backup API] Database connected');
    
    const { userId } = await auth();
    console.log('🔐 [Backup API] User ID:', userId);
    
    if (!userId) {
      console.log('❌ [Backup API] Unauthorized - no userId');
      return NextResponse.json({ 
        success: false,
        error: "Unauthorized" 
      }, { status: 401 });
    }

    const user = await User.findOne({ clerkId: userId });
    console.log('👤 [Backup API] User found:', !!user);
    
    if (!user) {
      console.log('❌ [Backup API] User not found in database');
      return NextResponse.json({ 
        success: false,
        error: "User not found" 
      }, { status: 404 });
    }

    const body = await req.json();
    console.log('📦 [Backup API] Request body received:', {
      hasBackup: !!body.backup,
      hasEncryptedMasterKey: !!body.backup?.encryptedMasterKey,
      hasIv: !!body.backup?.iv,
      hasAuthTag: !!body.backup?.authTag,
    });
    
    const { backup } = body;

    // ✅ FIXED: Validate for AES-GCM fields (no salt needed)
    if (!backup || !backup.encryptedMasterKey || !backup.iv || !backup.authTag) {
      console.log('❌ [Backup API] Invalid backup data - missing required fields');
      console.log('📦 [Backup API] Backup data:', {
        hasEncryptedMasterKey: !!backup?.encryptedMasterKey,
        hasIv: !!backup?.iv,
        hasAuthTag: !!backup?.authTag,
      });
      return NextResponse.json(
        { 
          success: false,
          error: "Invalid backup data - missing required fields (encryptedMasterKey, iv, authTag)" 
        },
        { status: 400 }
      );
    }

    // Save encrypted backup
    user.encryption_backup = backup;
    user.encryption_backup_created_at = new Date();
    await user.save();

    console.log('✅ [Backup API] Key backup uploaded for user:', userId);

    return NextResponse.json({
      success: true,
      message: "Key backup uploaded successfully",
      data: {
        user_id: user._id,
        backed_up_at: user.encryption_backup_created_at,
      },
    });
  } catch (error) {
    console.error("❌ [Backup API] Error uploading backup:", error);
    console.error("❌ [Backup API] Error stack:", error instanceof Error ? error.stack : 'Unknown');
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload backup",
      },
      { status: 500 }
    );
  }
}

// GET - Retrieve encrypted key backup
export async function GET() {
  try {
    console.log('📥 [Backup API] GET request received');
    
    await connectToDatabase();
    const { userId } = await auth();
    
    console.log('🔐 [Backup API] User ID:', userId);
    
    if (!userId) {
      console.log('❌ [Backup API] Unauthorized - no userId');
      return NextResponse.json({ 
        success: false,
        error: "Unauthorized" 
      }, { status: 401 });
    }

    const user = await User.findOne({ clerkId: userId });
    console.log('👤 [Backup API] User found:', !!user);
    
    if (!user) {
      console.log('❌ [Backup API] User not found in database');
      return NextResponse.json({ 
        success: false,
        error: "User not found" 
      }, { status: 404 });
    }

    if (!user.encryption_backup) {
      console.log('📦 [Backup API] No backup found for user:', userId);
      return NextResponse.json(
        { 
          success: true,
          data: null,
          message: "No backup found" 
        },
        { status: 200 }
      );
    }

    console.log('✅ [Backup API] Key backup retrieved for user:', userId);

    return NextResponse.json({
      success: true,
      data: {
        backup: user.encryption_backup,
        created_at: user.encryption_backup_created_at,
      },
    });
  } catch (error) {
    console.error("❌ [Backup API] Error retrieving backup:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to retrieve backup",
      },
      { status: 500 }
    );
  }
}