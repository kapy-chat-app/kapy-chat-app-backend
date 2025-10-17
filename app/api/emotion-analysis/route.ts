/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/emotion-analysis/route.ts
import {
  getEmotionStats,
  getEmotionHistory,
} from "@/lib/actions/emotion.action";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action");

    if (action === "stats") {
      const days = searchParams.get("days");
      const groupBy = searchParams.get("groupBy");

      const result = await getEmotionStats({
        days: days ? parseInt(days) : undefined,
        groupBy: (groupBy as "day" | "week" | "month") || undefined,
      });

      return NextResponse.json(result);
    }

    // Default: get history
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");
    const context = searchParams.get("context");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const result = await getEmotionHistory({
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      context: context as any,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
