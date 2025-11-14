// src/app/api/giphy/trending/route.ts
import {
  getTrendingStickers,
  getTrendingGifs,
} from "@/lib/actions/giphy.action";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get("type") as "gif" | "sticker") || "gif";
    const limit = parseInt(searchParams.get("limit") || "25");
    const offset = parseInt(searchParams.get("offset") || "0");
    const rating =
      (searchParams.get("rating") as "g" | "pg" | "pg-13" | "r") || "pg-13";

    let result;
    if (type === "sticker") {
      result = await getTrendingStickers(limit, offset, rating);
    } else {
      result = await getTrendingGifs(limit, offset, rating);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in Giphy trending API:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get trending Giphy",
      },
      { status: 500 }
    );
  }
}
