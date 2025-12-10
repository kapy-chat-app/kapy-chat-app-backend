import PushToken from "@/database/push-token.model";
import User from "@/database/user.model";

/**
 * Lấy push token của user từ clerkId
 */
export async function getPushTokenByClerkId(
  clerkId: string
): Promise<string | null> {
  try {
    const user = await User.findOne({ clerkId });
    if (!user) return null;

    const pushTokenDoc = await PushToken.findOne({
      user: user._id,
      is_active: true,
    }).sort({ last_used: -1 });

    return pushTokenDoc?.token || null;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}

/**
 * Lấy push token của user từ MongoDB _id
 */
export async function getPushTokenByUserId(
  userId: string
): Promise<string | null> {
  try {
    const pushTokenDoc = await PushToken.findOne({
      user: userId,
      is_active: true,
    }).sort({ last_used: -1 });

    return pushTokenDoc?.token || null;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}