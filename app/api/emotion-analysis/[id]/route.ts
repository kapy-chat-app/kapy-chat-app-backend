// app/api/emotion-analysis/[id]/route.ts
import { deleteEmotionAnalysis } from "@/lib/actions/emotion.action";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await deleteEmotionAnalysis(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}