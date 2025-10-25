/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// components/admin/UserListTable.tsx
import { useState } from "react";
import {
  Eye,
  Lock,
  Unlock,
  Ban,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  Shield,
  ShieldAlert,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { updateUserStatus } from "@/lib/actions/user.management.action";
import { CombinedUserData } from "@/dtos/user-management.dto";

interface UserListTableProps {
  users: CombinedUserData[];
  pagination: {
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

const UserListTable = ({
  users,
  pagination,
  onPageChange,
  onRefresh,
}: UserListTableProps) => {
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  const handleUserAction = async (
    userId: string,
    action: "ban" | "unban" | "lock" | "unlock"
  ) => {
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    try {
      setProcessingUserId(userId);
      await updateUserStatus({ userId, action });
      alert(`User ${action}ed successfully`);
      onRefresh();
    } catch (error: any) {
      alert(`Failed to ${action} user: ${error.message}`);
    } finally {
      setProcessingUserId(null);
    }
  };

  const getStatusBadge = (user: CombinedUserData) => {
    if (user.accountStatus === "banned") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
          <Ban className="w-3 h-3" />
          Banned
        </span>
      );
    }
    if (user.accountStatus === "locked") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
          <Lock className="w-3 h-3" />
          Locked
        </span>
      );
    }
    if (user.is_online) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Online
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">
        <Clock className="w-3 h-3" />
        Offline
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-purple-100 text-purple-800",
      moderator: "bg-blue-100 text-blue-800",
      user: "bg-gray-100 text-gray-800",
    };

    const icons: Record<string, any> = {
      admin: ShieldAlert,
      moderator: Shield,
      user: UserCheck,
    };

    const Icon = icons[role] || UserCheck;
    const colorClass = colors[role] || colors.user;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 ${colorClass} text-xs font-medium rounded-full`}
      >
        <Icon className="w-3 h-3" />
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  return (
    <div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Seen
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                {/* User Info */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                      {user.displayAvatar ? (
                        <Image
                          src={user.displayAvatar}
                          alt={user.displayName}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 font-semibold">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {user.displayName}
                      </div>
                      <div className="text-sm text-gray-500">
                        @{user.username}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Email */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900">{user.email}</span>
                    {user.emailVerified ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </td>

                {/* Role */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {getRoleBadge(user.role)}
                </td>

                {/* Status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(user)}
                </td>

                {/* Last Seen */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {user.last_seen
                      ? new Date(user.last_seen).toLocaleString()
                      : "Never"}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {/* View Detail */}
                    <Link
                      href={`/users/${user._id}`}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>

                    {/* Ban/Unban */}
                    {user.accountStatus !== "banned" ? (
                      <button
                        onClick={() => handleUserAction(user._id, "ban")}
                        disabled={processingUserId === user._id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Ban User"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUserAction(user._id, "unban")}
                        disabled={processingUserId === user._id}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Unban User"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                    )}

                    {/* Lock/Unlock */}
                    {user.accountStatus !== "locked" ? (
                      <button
                        onClick={() => handleUserAction(user._id, "lock")}
                        disabled={processingUserId === user._id}
                        className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Lock Account"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUserAction(user._id, "unlock")}
                        disabled={processingUserId === user._id}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Unlock Account"
                      >
                        <Unlock className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 border-t flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Page {pagination.currentPage} of {pagination.totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrevPage}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => onPageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNextPage}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserListTable;
