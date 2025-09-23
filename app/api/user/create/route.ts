import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/actions/user.action";
import { auth } from "@clerk/nextjs/server";

interface CreateUserBody {
  email: string;
  full_name: string;
  username: string;
  bio?: string;
  phone?: string;
  date_of_birth?: Date;
  gender?: string;
  location?: string;
  website?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Lấy clerkId từ JWT token thay vì frontend
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: CreateUserBody = await request.json();

    // Validate required fields (không cần clerkId nữa)
    const requiredFields = ["email", "full_name", "username"];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { success: false, error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(body.username)) {
      return NextResponse.json(
        {
          success: false,
          error: "Username must be 3-20 characters, alphanumeric and underscore only",
        },
        { status: 400 }
      );
    }

    // Tạo user với clerkId từ token
    const result = await createUser({
      clerkId: userId, // Từ JWT token, không từ frontend
      email: body.email,
      full_name: body.full_name,
      username: body.username,
      bio: body.bio || "",
      phone: body.phone || "",
      date_of_birth: body.date_of_birth,
      gender: body.gender,
      location: body.location || "",
      website: body.website || "",
    });

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
