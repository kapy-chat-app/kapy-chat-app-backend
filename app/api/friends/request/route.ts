import {
  sendFriendRequest,
  respondToFriendRequest,
  getFriendRequests,
} from "@/lib/actions/friend.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";


export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    
    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type') as 'received' | 'sent' | 'all' || 'received';

    // Validate type parameter
    if (!['received', 'sent', 'all'].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type parameter. Must be 'received', 'sent', or 'all'" },
        { status: 400 }
      );
    }

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 }
      );
    }

    const result = await getFriendRequests(clerkId, {
      page,
      limit,
      type
    });

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Get friend requests API error:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Internal server error",
        requests: [],
        totalCount: 0
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const {userId: clerkId} = await auth();
    const body = await request.json();
    const { recipientId } = body;

    if (!recipientId) {
      return NextResponse.json(
        { error: "Recipient ID is required" },
        { status: 400 }
      );
    }

    const result = await sendFriendRequest(clerkId!,{ recipientId });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Send friend request API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const {userId: clerkId} = await auth();
    const body = await request.json();
    const { requestId, action } = body;

    if (!requestId || !action) {
      return NextResponse.json(
        { error: "Request ID and action are required" },
        { status: 400 }
      );
    }

    if (!["accept", "decline", "block"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const result = await respondToFriendRequest(clerkId!,{ requestId, action });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Respond to friend request API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
