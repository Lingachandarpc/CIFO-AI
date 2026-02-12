"use client";

import { useState } from "react";

export default function SearchBar({
  onSearch,
}: {
  onSearch: (query: string, category: string) => void;
}) {
  const [query, setQuery] = useState("");

  return (
    <div className="flex gap-3 w-full max-w-2xl">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a story, book, case study..."
        onKeyPress={(e) => e.key === "Enter" && onSearch(query, "Search")}
        className="flex-1 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted-strong)] focus:border-[var(--muted-strong)] rounded-lg px-5 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none transition-colors text-lg"
      />
      <button
        onClick={() => onSearch(query, "Search")}
        className="px-6 py-3 bg-[var(--foreground)] text-[var(--background)] font-bold rounded-lg hover:opacity-90 active:opacity-80 transition-all duration-150 transform hover:scale-105"
      >
        SEARCH
      </button>
      <button
        onClick={() => onSearch(query, "Ask")}
        className="px-4 py-3 ml-2 bg-[var(--surface)] text-[var(--foreground)] font-bold rounded-lg hover:bg-[var(--surface-strong)] transition-all duration-150"
      >
        ASK
      </button>
    </div>
  );
}
