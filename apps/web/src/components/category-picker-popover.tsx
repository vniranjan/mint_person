"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { VALID_CATEGORIES, CATEGORY_DOT_COLORS } from "~/lib/categories";

interface CategoryPickerPopoverProps {
  children: React.ReactNode;
  onSelect: (category: string) => void;
}

/**
 * Inline category picker — UX-DR8.
 * Wraps shadcn Popover. No modal, no save button.
 * Arrow keys navigate list; Enter selects; Escape closes.
 */
export default function CategoryPickerPopover({ children, onSelect }: CategoryPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // 300ms debounce on search filter (AC2)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = VALID_CATEGORIES.filter((c) =>
    c.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const handleSelect = useCallback(
    (category: string) => {
      onSelect(category);
      setOpen(false);
      setSearch("");
      setFocusedIndex(0);
    },
    [onSelect],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Focus search input when opening
      setTimeout(() => searchRef.current?.focus(), 10);
    } else {
      setSearch("");
      setFocusedIndex(0);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[focusedIndex]) handleSelect(filtered[focusedIndex]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-56 p-2"
        align="start"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <input
          ref={searchRef}
          type="text"
          placeholder="Search categories…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setFocusedIndex(0);
          }}
          className="mb-1 w-full rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400"
          aria-label="Search categories"
          autoComplete="off"
        />
        {/* Category list */}
        <ul role="listbox" aria-label="Categories">
          {filtered.map((category, idx) => (
            <li
              key={category}
              role="option"
              aria-selected={idx === focusedIndex}
              onClick={() => handleSelect(category)}
              onMouseEnter={() => setFocusedIndex(idx)}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-stone-900 ${
                idx === focusedIndex ? "bg-stone-100" : "hover:bg-stone-50"
              }`}
            >
              {/* Color dot */}
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_DOT_COLORS[category] }}
                aria-hidden="true"
              />
              {category}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-1 text-xs text-stone-400">No categories found</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
