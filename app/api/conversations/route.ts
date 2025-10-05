import { NextRequest, NextResponse } from "next/server";
import {
  createConversation,
  getConversations,
} from "@/lib/actions/conversation.action";
import { CreateConversationDTO } from "@/dtos/conversation.dto";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const result = await getConversations(page, limit);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("API Error - GET /conversations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateConversationDTO = await req.json();

    // Validate required fields
    if (
      !body.type ||
      !body.participantIds ||
      !Array.isArray(body.participantIds)
    ) {
      return NextResponse.json(
        { error: "Missing required fields: type, participantIds" },
        { status: 400 }
      );
    }

    const result = await createConversation(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        timestamp: new Date(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("API Error - POST /conversations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
