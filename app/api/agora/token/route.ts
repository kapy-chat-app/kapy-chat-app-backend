// app/api/agora/token/route.ts
import { RtcTokenBuilder, RtcRole } from "agora-access-token";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ read body once
    const body = await req.json();

    // ✅ accept both key styles
    const channelName: string | undefined =
      body.channelName || body.channel_name;

    const role: "publisher" | "subscriber" = body.role || "publisher";
    const uid: number | undefined = body.uid;

    console.log("🎫 [AGORA TOKEN] body keys:", Object.keys(body));
    console.log("🎫 [AGORA TOKEN] channelName:", channelName);

    if (!channelName) {
      return NextResponse.json(
        {
          error: "Channel name is required",
          receivedKeys: Object.keys(body),
        },
        { status: 400 }
      );
    }

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      return NextResponse.json(
        { error: "Agora credentials not configured" },
        { status: 500 }
      );
    }

    // Token expiration time (24 hours)
    const expirationTimeInSeconds = 24 * 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // ✅ Generate UID if not provided
    const userUid = uid ?? Math.floor(Math.random() * 100000);

    // ✅ Build token
    const tokenRole =
      role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      userUid,
      tokenRole,
      privilegeExpiredTs
    );

    console.log(
      `🎥 Agora token generated for user ${userId}, channel: ${channelName}, uid: ${userUid}`
    );

    return NextResponse.json({
      token,
      appId,
      channelName,
      uid: userUid,
      expiresAt: privilegeExpiredTs,
    });
  } catch (error) {
    console.error("❌ Error generating Agora token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
