// src/app/api/giphy/[id]/route.ts
import { getGiphyById } from "@/lib/actions/giphy.action";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Giphy ID is required" },
        { status: 400 }
      );
    }

    const result = await getGiphyById(id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in Giphy get by ID API:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to get Giphy item" 
      },
      { status: 500 }
    );
  }
}