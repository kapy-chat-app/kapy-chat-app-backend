"use client";

// components/admin/UserSearchBar.tsx
import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface UserSearchBarProps {
  initialValue?: string;
  onSearch: (query: string) => void;
  placeholder?: string;
}

const UserSearchBar = ({
  initialValue = '',
  onSearch,
  placeholder = 'Search users...',
}: UserSearchBarProps) => {
  const [searchQuery, setSearchQuery] = useState(initialValue);
  const [debouncedQuery, setDebouncedQuery] = useState(initialValue);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Trigger search when debounced query changes
  useEffect(() => {
    onSearch(debouncedQuery);
  }, [debouncedQuery, onSearch]);

  const handleClear = () => {
    setSearchQuery('');
    setDebouncedQuery('');
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      {searchQuery && searchQuery !== debouncedQuery && (
        <div className="absolute right-0 top-full mt-1 text-xs text-gray-500">
          Searching...
        </div>
      )}
    </div>
  );
};

export default UserSearchBar;