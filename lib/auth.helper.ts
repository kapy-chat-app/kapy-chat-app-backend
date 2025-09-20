// lib/helpers/auth.helper.ts
import { NextApiRequest } from "next";
import { getAuth, clerkClient } from "@clerk/nextjs/server";

/**
 * Kiểm tra phân quyền user
 * @param req - NextApiRequest
 * @param requiredRole - Role cần thiết (string hoặc array)
 * @returns Object chứa thông tin auth
 */
export async function checkUserPermission(
  req: NextApiRequest,
  requiredRole: string | string[]
) {
  // Kiểm tra đăng nhập
  const { userId } = getAuth(req);
  if (!userId) {
    return {
      success: false,
      status: 401,
      message: "Unauthorized. Please log in.",
    };
  }

  // Lấy thông tin user
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);

  // Lấy role từ metadata
  const userRole =
    (user.privateMetadata?.role as string | undefined) ||
    (user.publicMetadata?.role as string | undefined);

  if (!userRole) {
    return {
      success: false,
      status: 403,
      message: "Bạn chưa được phân quyền. Vui lòng liên hệ admin.",
    };
  }

  // Kiểm tra role
  const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  if (!allowedRoles.includes(userRole)) {
    const roleText = allowedRoles.length === 1 
      ? allowedRoles[0] 
      : allowedRoles.join(" hoặc ");
    
    return {
      success: false,
      status: 403,
      message: `Bạn không có quyền thực hiện thao tác này. Chỉ ${roleText} mới được phép.`,
    };
  }

  // Thành công
  return {
    success: true,
    userId,
    userRole,
  };
}