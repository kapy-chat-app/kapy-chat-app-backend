/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// app/admin/users/page.tsx
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UserListResponse,
  UserListQueryParams,
} from "@/dtos/user-management.dto";
import { getUserList } from "@/lib/actions/user.management.action";
import UserFilters from "@/components/page/user/UserFilters";
import UserListTable from "@/components/page/user/UserListTable";
import UserSearchBar from "@/components/page/user/UserSearchBar";
import { Loader2 } from "lucide-react";

const UserManagementPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [userListData, setUserListData] = useState<UserListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⭐ Extract individual values - these are primitives, stable
  const page = searchParams.get("page");
  const limit = searchParams.get("limit");
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const role = searchParams.get("role");
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const gender = searchParams.get("gender");
  const emailVerified = searchParams.get("emailVerified");

  // Fetch users when URL params change
  useEffect(() => {
    let isMounted = true; // Prevent state updates if unmounted

    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError(null);

        // Build filters object inside useEffect
        const filters: UserListQueryParams = {
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          search: search || "",
          status: (status as any) || "all",
          role: (role as any) || "all",
          sortBy: (sortBy as any) || "created_at",
          sortOrder: (sortOrder as any) || "desc",
          gender: (gender as any) || "all",
          emailVerified: (emailVerified as any) || "all",
        };

        console.log("🔍 Fetching users with filters:", filters);
        const response = await getUserList(filters);
        
        if (isMounted) {
          console.log("✅ Fetched users:", response.data.length);
          setUserListData(response);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load users");
          console.error("❌ Error fetching users:", err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      isMounted = false; // Cleanup
    };
  }, [page, limit, search, status, role, sortBy, sortOrder, gender, emailVerified]);

  // Parse current filters for display
  const currentFilters: UserListQueryParams = {
    page: Number(page) || 1,
    limit: Number(limit) || 20,
    search: search || "",
    status: (status as any) || "all",
    role: (role as any) || "all",
    sortBy: (sortBy as any) || "created_at",
    sortOrder: (sortOrder as any) || "desc",
    gender: (gender as any) || "all",
    emailVerified: (emailVerified as any) || "all",
  };

  // Update URL with new filters
  const updateFilters = (newFilters: Partial<UserListQueryParams>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && value !== "all" && value !== "") {
        params.set(key, String(value));
      } else {
        params.delete(key);
      }
    });

    // Reset to page 1 when filters change (except pagination)
    if (!newFilters.page) {
      params.set("page", "1");
    }

    router.push(`?${params.toString()}`);
  };

  // Handle search
  const handleSearch = (search: string) => {
    updateFilters({ search, page: 1 });
  };

  // Handle filter change
  const handleFilterChange = (filters: Partial<UserListQueryParams>) => {
    updateFilters({ ...filters, page: 1 });
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    updateFilters({ page });
  };

  // Handle refresh
  const handleRefresh = () => {
    // Trigger refetch by updating a dummy param, then removing it
    const params = new URLSearchParams(searchParams.toString());
    params.set("_refresh", Date.now().toString());
    router.push(`?${params.toString()}`);
    
    // Remove the dummy param after navigation
    setTimeout(() => {
      const cleanParams = new URLSearchParams(searchParams.toString());
      cleanParams.delete("_refresh");
      router.replace(`?${cleanParams.toString()}`);
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            User Management
          </h1>
          <p className="text-gray-600">
            Manage all users in your chat application
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <UserSearchBar
            initialValue={currentFilters.search || ""}
            onSearch={handleSearch}
            placeholder="Search by name, username, or email..."
          />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <UserFilters
            currentFilters={currentFilters}
            onFilterChange={handleFilterChange}
            availableFilters={userListData?.filters.available}
          />
        </div>

        {/* Stats Bar */}
        {userListData && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {userListData.pagination.totalUsers}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Current Page</p>
                <p className="text-2xl font-bold text-gray-900">
                  {userListData.pagination.currentPage} /{" "}
                  {userListData.pagination.totalPages}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Showing</p>
                <p className="text-2xl font-bold text-gray-900">
                  {userListData.data.length}
                </p>
              </div>
              <div>
                <button
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  disabled={loading}
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User List Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading users...</span>
            </div>
          )}

          {error && (
            <div className="p-6 text-center">
              <div className="text-red-600 mb-4">
                <p className="font-semibold">Error loading users</p>
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && userListData && userListData.data.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-lg mb-2">No users found</p>
              <p className="text-gray-400 text-sm">
                Try adjusting your search or filters
              </p>
            </div>
          )}

          {!loading && !error && userListData && userListData.data.length > 0 && (
            <UserListTable
              users={userListData.data}
              pagination={userListData.pagination}
              onPageChange={handlePageChange}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagementPage;