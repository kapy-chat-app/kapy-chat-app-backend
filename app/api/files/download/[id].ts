// pages/api/files/download/[id].ts - NEW FILE
import { downloadEncryptedFile } from "@/lib/actions/file.action";
import { auth } from "@clerk/nextjs/server";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid file ID",
      });
    }

    console.log("📥 API: Downloading encrypted file:", id);

    const result = await downloadEncryptedFile(id, userId);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("❌ Download encrypted file API error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
