// app/api/emotion/recommendations/route.ts

import { getEmotionRecommendations } from "@/lib/actions/emotion.action";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await getEmotionRecommendations({ userId: "" });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
