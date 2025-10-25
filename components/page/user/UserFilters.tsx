/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
// components/admin/UserFilters.tsx
import { UserListQueryParams } from "@/dtos/user-management.dto";
import { Filter, X } from "lucide-react";
import { useState } from "react";

interface UserFiltersProps {
  currentFilters: UserListQueryParams;
  onFilterChange: (filters: Partial<UserListQueryParams>) => void;
  availableFilters?: {
    statuses: string[];
    roles: string[];
    genders: string[];
  };
}

const UserFilters = ({
  currentFilters,
  onFilterChange,
  availableFilters,
}: UserFiltersProps) => {
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = Object.entries(currentFilters).filter(
    ([key, value]) =>
      value &&
      value !== "all" &&
      value !== "" &&
      key !== "page" &&
      key !== "limit"
  ).length;

  const handleReset = () => {
    onFilterChange({
      status: "all",
      role: "all",
      gender: "all",
      emailVerified: "all",
      sortBy: "created_at",
      sortOrder: "desc",
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium"
        >
          <Filter className="w-5 h-5" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4" />
            Clear all
          </button>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={currentFilters.status || "all"}
              onChange={(e) =>
                onFilterChange({ status: e.target.value as any })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {(
                availableFilters?.statuses || [
                  "all",
                  "active",
                  "banned",
                  "locked",
                  "online",
                  "offline",
                ]
              ).map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role
            </label>
            <select
              value={currentFilters.role || "all"}
              onChange={(e) => onFilterChange({ role: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {(
                availableFilters?.roles || ["all", "user", "admin", "moderator"]
              ).map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gender
            </label>
            <select
              value={currentFilters.gender || "all"}
              onChange={(e) =>
                onFilterChange({ gender: e.target.value as any })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {(
                availableFilters?.genders || [
                  "all",
                  "male",
                  "female",
                  "other",
                  "private",
                ]
              ).map((gender) => (
                <option key={gender} value={gender}>
                  {gender.charAt(0).toUpperCase() + gender.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Email Verified Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Status
            </label>
            <select
              value={currentFilters.emailVerified || "all"}
              onChange={(e) =>
                onFilterChange({ emailVerified: e.target.value as any })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">All</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort By
            </label>
            <select
              value={currentFilters.sortBy || "created_at"}
              onChange={(e) =>
                onFilterChange({ sortBy: e.target.value as any })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="created_at">Created Date</option>
              <option value="last_seen">Last Seen</option>
              <option value="full_name">Name</option>
              <option value="email">Email</option>
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort Order
            </label>
            <select
              value={currentFilters.sortOrder || "desc"}
              onChange={(e) =>
                onFilterChange({ sortOrder: e.target.value as any })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>

          {/* Results Per Page */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Per Page
            </label>
            <select
              value={currentFilters.limit || 20}
              onChange={(e) =>
                onFilterChange({ limit: Number(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserFilters;
