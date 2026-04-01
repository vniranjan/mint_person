/**
 * Category taxonomy constants — FR19 + UX-DR2.
 *
 * Tailwind classes use custom tokens defined in tailwind.config.ts
 * (bg-category-*-bg / text-category-*-text) to ensure PurgeCSS safety.
 */

export const VALID_CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Subscriptions",
  "Healthcare",
  "Entertainment",
  "Utilities",
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

export interface CategoryColorPair {
  bgClass: string;
  textClass: string;
}

export const CATEGORY_COLORS: Record<string, CategoryColorPair> = {
  Groceries:     { bgClass: "bg-category-groceries-bg",     textClass: "text-category-groceries-text"     },
  Dining:        { bgClass: "bg-category-dining-bg",        textClass: "text-category-dining-text"        },
  Transport:     { bgClass: "bg-category-transport-bg",     textClass: "text-category-transport-text"     },
  Shopping:      { bgClass: "bg-category-shopping-bg",      textClass: "text-category-shopping-text"      },
  Subscriptions: { bgClass: "bg-category-subscriptions-bg", textClass: "text-category-subscriptions-text" },
  Healthcare:    { bgClass: "bg-category-healthcare-bg",    textClass: "text-category-healthcare-text"    },
  Entertainment: { bgClass: "bg-category-entertainment-bg", textClass: "text-category-entertainment-text" },
  Utilities:     { bgClass: "bg-category-utilities-bg",     textClass: "text-category-utilities-text"     },
};

/** Color dot hex values for popover list dots (UX-DR8). */
export const CATEGORY_DOT_COLORS: Record<string, string> = {
  Groceries:     "#15803d",
  Dining:        "#c2410c",
  Transport:     "#1d4ed8",
  Shopping:      "#6d28d9",
  Subscriptions: "#0e7490",
  Healthcare:    "#be123c",
  Entertainment: "#7e22ce",
  Utilities:     "#334155",
};
