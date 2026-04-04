"use client";

import { useState, useEffect, useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Debounce delay in ms. Default: 300 */
  debounceMs?: number;
}

/**
 * Debounced search input for transaction search (Story 4.4).
 * Calls onChange after debounceMs of inactivity — does NOT fire on mount.
 */
export default function SearchInput({ value, onChange, debounceMs = 300 }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const hasTyped = useRef(false);

  // Sync external reset (e.g. clearing search from parent)
  useEffect(() => {
    setLocalValue(value);
    if (!value) hasTyped.current = false;
  }, [value]);

  // Debounce — only fires after user has typed, not on initial mount
  useEffect(() => {
    if (!hasTyped.current) return;
    const timer = setTimeout(() => {
      onChange(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    hasTyped.current = true;
    setLocalValue(e.target.value);
  }

  function handleClear() {
    hasTyped.current = false;
    setLocalValue("");
    onChange("");
  }

  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 4.15 4.15a7.5 7.5 0 0 0 12.5 12.5z"
        />
      </svg>
      <input
        type="search"
        placeholder="Search by merchant or amount…"
        value={localValue}
        onChange={handleChange}
        className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
        aria-label="Search transactions"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
