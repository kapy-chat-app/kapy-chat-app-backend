// app/api/emotion-analysis/patterns/route.ts
import { getEmotionPatterns } from "@/lib/actions/emotion.action";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await getEmotionPatterns();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
