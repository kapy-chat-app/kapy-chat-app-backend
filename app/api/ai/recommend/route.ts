// src/app/api/ai/recommend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getEmotionRecommendation } from "@/lib/actions/ai-chat.unified.action";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const language = (searchParams.get("language") || "vi") as
      | "vi"
      | "en"
      | "zh";

    const result = await getEmotionRecommendation(language);
    return NextResponse.json(result);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}