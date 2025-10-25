/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/recording/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { processCallRecording, getCallEmotionAnalysis } from "@/lib/actions/call.action";

/**
 * POST /api/calls/recording
 * Upload call recording for emotion analysis
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    
    const callId = formData.get("callId") as string;
    const audioFile = formData.get("audio") as File | null;
    const videoFile = formData.get("video") as File | null;
    const recordingDuration = formData.get("recordingDuration") 
      ? parseInt(formData.get("recordingDuration") as string) 
      : undefined;

    if (!callId) {
      return NextResponse.json(
        { success: false, error: "Call ID is required" },
        { status: 400 }
      );
    }

    if (!audioFile && !videoFile) {
      return NextResponse.json(
        { success: false, error: "At least one recording (audio or video) is required" },
        { status: 400 }
      );
    }

    console.log(`📤 Receiving call recording from user ${userId}, call ${callId}`);

    // Convert files to buffers
    let audioBuffer: Buffer | undefined;
    let videoFrameBuffer: Buffer | undefined;

    if (audioFile) {
      const audioArrayBuffer = await audioFile.arrayBuffer();
      audioBuffer = Buffer.from(audioArrayBuffer);
      console.log(`🎤 Audio received: ${audioBuffer.length} bytes`);
    }

    if (videoFile) {
      const videoArrayBuffer = await videoFile.arrayBuffer();
      videoFrameBuffer = Buffer.from(videoArrayBuffer);
      console.log(`📹 Video frame received: ${videoFrameBuffer.length} bytes`);
    }

    // Process recording and analyze emotion
    const result = await processCallRecording({
      userId,
      callId,
      audioBuffer,
      videoFrameBuffer,
      recordingDuration,
    });

    console.log(`✅ Call recording processed successfully`);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ Error uploading call recording:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process recording",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calls/recording?callId=xxx&userId=xxx
 * Get emotion analysis for a call
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: authUserId } = await auth();
    if (!authUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const callId = searchParams.get("callId");
    const userId = searchParams.get("userId");

    if (!callId) {
      return NextResponse.json(
        { success: false, error: "Call ID is required" },
        { status: 400 }
      );
    }

    
    const result = await getCallEmotionAnalysis({
      callId,
      userId: userId || undefined,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ Error getting call emotion analysis:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get emotion analysis",
      },
      { status: 500 }
    );
  }
}