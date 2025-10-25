/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// app/admin/users/[userId]/page.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Globe,
  Calendar,
  Shield,
  Ban,
  Lock,
  Unlock,
  UserCheck,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MessageCircle,
  Users,
  PhoneCall,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { UserDetailResponse } from "@/dtos/user-management.dto";
import {
  getUserDetail,
  updateUserStatus,
} from "@/lib/actions/user.management.action";

interface UserDetailPageProps {
  params: {
    userId: string;
  };
}

const UserDetailPage = ({ params }: UserDetailPageProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userDetail, setUserDetail] = useState<UserDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Fetch user detail
  const fetchUserDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getUserDetail(params.userId);
      setUserDetail(response);
    } catch (err: any) {
      setError(err.message || "Failed to load user details");
      console.error("Error fetching user detail:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserDetail();
  }, [params.userId]);

  // Handle user action
  const handleUserAction = async (
    action: "ban" | "unban" | "lock" | "unlock"
  ) => {
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    try {
      setProcessing(true);
      await updateUserStatus({ userId: params.userId, action });
      alert(`User ${action}ed successfully`);
      await fetchUserDetail();
    } catch (error: any) {
      alert(`Failed to ${action} user: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading user details...</span>
      </div>
    );
  }

  if (error || !userDetail) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-4">
            {error || "User not found"}
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const user = userDetail.data;
  const stats = userDetail.statistics;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Users
          </button>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {user.accountStatus !== "banned" ? (
              <button
                onClick={() => handleUserAction("ban")}
                disabled={processing}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                Ban User
              </button>
            ) : (
              <button
                onClick={() => handleUserAction("unban")}
                disabled={processing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                Unban User
              </button>
            )}

            {user.accountStatus !== "locked" ? (
              <button
                onClick={() => handleUserAction("lock")}
                disabled={processing}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                Lock Account
              </button>
            ) : (
              <button
                onClick={() => handleUserAction("unlock")}
                disabled={processing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Unlock className="w-4 h-4" />
                Unlock Account
              </button>
            )}
          </div>
        </div>

        {/* User Profile Card */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
          {/* Cover Photo */}
          <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600" />

          <div className="px-6 pb-6">
            {/* Avatar & Basic Info */}
            <div className="flex items-start gap-6 -mt-16 mb-6">
              <div className="relative w-32 h-32 rounded-full overflow-hidden bg-white ring-4 ring-white">
                {user.displayAvatar ? (
                  <Image
                    src={user.displayAvatar}
                    alt={user.displayName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-500 text-4xl font-semibold">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="flex-1 pt-16">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">
                      {user.displayName}
                    </h1>
                    <p className="text-lg text-gray-600">@{user.username}</p>
                  </div>

                  {/* Status Badges */}
                  <div className="flex flex-col items-end gap-2">
                    {/* Account Status */}
                    {user.accountStatus === "banned" && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">
                        <Ban className="w-4 h-4" />
                        Banned
                      </span>
                    )}
                    {user.accountStatus === "locked" && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">
                        <Lock className="w-4 h-4" />
                        Locked
                      </span>
                    )}
                    {user.accountStatus === "active" && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                        <CheckCircle className="w-4 h-4" />
                        Active
                      </span>
                    )}

                    {/* Role Badge */}
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-sm font-medium rounded-full">
                      <Shield className="w-4 h-4" />
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>

                    {/* Online Status */}
                    {user.is_online && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        Online
                      </span>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {user.bio && (
                  <p className="text-gray-700 mb-4 max-w-2xl">{user.bio}</p>
                )}

                {/* Status */}
                {user.status && (
                  <p className="text-gray-600 italic mb-4">"{user.status}"</p>
                )}

                {/* Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-5 h-5" />
                    <span>{user.email}</span>
                    {user.emailVerified ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-400" />
                    )}
                  </div>

                  {user.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-5 h-5" />
                      <span>{user.phone}</span>
                    </div>
                  )}

                  {user.location && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-5 h-5" />
                      <span>{user.location}</span>
                    </div>
                  )}

                  {user.website && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Globe className="w-5 h-5" />
                      <a
                        href={user.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {user.website}
                      </a>
                    </div>
                  )}

                  {user.date_of_birth && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-5 h-5" />
                      <span>
                        {new Date(user.date_of_birth).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-5 h-5" />
                    <span>Joined {stats.accountAge} ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <MessageCircle className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">
              {stats.totalConversations}
            </p>
            <p className="text-sm text-gray-600">Conversations</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">
              {stats.totalMessages}
            </p>
            <p className="text-sm text-gray-600">Messages</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <PhoneCall className="w-8 h-8 text-purple-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">
              {stats.totalCalls}
            </p>
            <p className="text-sm text-gray-600">Calls</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-orange-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">
              {stats.totalFriends}
            </p>
            <p className="text-sm text-gray-600">Friends</p>
          </div>
        </div>

        {/* Detailed Info Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Privacy Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Privacy Settings
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Profile Visibility:</span>
                <span className="font-medium capitalize">
                  {user.privacy_settings.profile_visibility}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Phone Visibility:</span>
                <span className="font-medium capitalize">
                  {user.privacy_settings.phone_visibility}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Email Visibility:</span>
                <span className="font-medium capitalize">
                  {user.privacy_settings.email_visibility}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Seen Visibility:</span>
                <span className="font-medium capitalize">
                  {user.privacy_settings.last_seen_visibility}
                </span>
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Notification Settings
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Messages:</span>
                <span
                  className={`font-medium ${
                    user.notification_settings.message_notifications
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {user.notification_settings.message_notifications
                    ? "Enabled"
                    : "Disabled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Calls:</span>
                <span
                  className={`font-medium ${
                    user.notification_settings.call_notifications
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {user.notification_settings.call_notifications
                    ? "Enabled"
                    : "Disabled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Friend Requests:</span>
                <span
                  className={`font-medium ${
                    user.notification_settings.friend_request_notifications
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {user.notification_settings.friend_request_notifications
                    ? "Enabled"
                    : "Disabled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">AI Suggestions:</span>
                <span
                  className={`font-medium ${
                    user.notification_settings.ai_suggestions_notifications
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {user.notification_settings.ai_suggestions_notifications
                    ? "Enabled"
                    : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          {/* AI Preferences */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              AI Preferences
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Behavior Analysis:</span>
                <span
                  className={`font-medium ${
                    user.ai_preferences.enable_behavior_analysis
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {user.ai_preferences.enable_behavior_analysis
                    ? "Enabled"
                    : "Disabled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Emotion Suggestions:</span>
                <span
                  className={`font-medium ${
                    user.ai_preferences.enable_emotion_suggestions
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {user.ai_preferences.enable_emotion_suggestions
                    ? "Enabled"
                    : "Disabled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Suggestion Frequency:</span>
                <span className="font-medium capitalize">
                  {user.ai_preferences.preferred_suggestion_frequency}
                </span>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Account Information
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Clerk ID:</span>
                <span className="font-mono text-sm">{user.clerkId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Gender:</span>
                <span className="font-medium capitalize">{user.gender}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Activity:</span>
                <span className="font-medium">{stats.lastActivity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Created:</span>
                <span className="font-medium">
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDetailPage;
