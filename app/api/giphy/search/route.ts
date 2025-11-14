// src/app/api/giphy/search/route.ts
import { searchStickers, searchGifs } from "@/lib/actions/giphy.action";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");
    const type = (searchParams.get("type") as "gif" | "sticker") || "gif";
    const limit = parseInt(searchParams.get("limit") || "25");
    const offset = parseInt(searchParams.get("offset") || "0");
    const rating =
      (searchParams.get("rating") as "g" | "pg" | "pg-13" | "r") || "pg-13";

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Query parameter is required" },
        { status: 400 }
      );
    }

    let result;
    if (type === "sticker") {
      result = await searchStickers(query, limit, offset, rating);
    } else {
      result = await searchGifs(query, limit, offset, rating);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in Giphy search API:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to search Giphy",
      },
      { status: 500 }
    );
  }
}
