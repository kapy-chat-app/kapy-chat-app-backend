/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/conversations/[id]/files/upload-chunk/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { uploadSessionStore } from "@/lib/uploadSessionStore";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { id: conversationId } = await params;
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { uploadId, chunkIndex, chunkData } = body;

    if (!uploadId || chunkIndex === undefined || !chunkData) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`📤 [Upload Chunk] uploadId: ${uploadId}, chunk: ${chunkIndex + 1}`);
    console.log(`📊 Active sessions: ${uploadSessionStore.size()}`);

    // ✅ Get from singleton
    const session = uploadSessionStore.get(uploadId);
    
    if (!session) {
      console.error(`❌ Session not found: ${uploadId}`);
      return NextResponse.json(
        { error: "Upload session not found or expired. Please restart upload." },
        { status: 404 }
      );
    }

    if (session.clerkUserId !== clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (session.conversationId !== conversationId) {
      return NextResponse.json({ error: "Conversation ID mismatch" }, { status: 400 });
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      return NextResponse.json(
        { error: `Invalid chunk index: ${chunkIndex}` },
        { status: 400 }
      );
    }

    if (session.chunks.has(chunkIndex)) {
      console.log(`⚠️ Chunk ${chunkIndex + 1} already uploaded`);
      return NextResponse.json({
        chunkId: `${uploadId}-${chunkIndex}`,
        receivedChunks: session.chunks.size,
        totalChunks: session.totalChunks,
        message: 'Chunk already uploaded',
      });
    }

    session.chunks.set(chunkIndex, chunkData);

    const chunkId = `${uploadId}-${chunkIndex}`;
    const progress = ((session.chunks.size / session.totalChunks) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Chunk ${chunkIndex + 1}/${session.totalChunks} stored (${progress}%) [${elapsed}s]`);

    return NextResponse.json({
      chunkId,
      receivedChunks: session.chunks.size,
      totalChunks: session.totalChunks,
      progress: parseFloat(progress),
    });

  } catch (error: any) {
    console.error('❌ [Upload Chunk] Error:', error);
    return NextResponse.json(
      { error: error.message || "Failed to upload chunk" },
      { status: 500 }
    );
  }
}