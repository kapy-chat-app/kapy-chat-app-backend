// src/app/api/ai/recommend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getEmotionRecommendation } from "@/lib/actions/ai-chat.action";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const language = (searchParams.get('language') || 'vi') as 'vi' | 'en' | 'zh';

  const result = await getEmotionRecommendation(language);
  
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}