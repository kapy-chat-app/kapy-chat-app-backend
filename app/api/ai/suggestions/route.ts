import { getSmartSuggestions } from "@/lib/actions/ai-chat.unified.action";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const language = (searchParams.get("language") || "vi") as "vi" | "en" | "zh";
    const limit = parseInt(searchParams.get("limit") || "4");

    const result = await getSmartSuggestions({ language, limit });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}