"use client";

import { useState } from "react";

export default function SearchBar({
  onSearch,
}: {
  onSearch: (query: string, category: string) => void;
}) {
  const [query, setQuery] = useState("");

  return (
    <div className="flex gap-2 w-full max-w-md">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a story, book, case study..."
        className="flex-1 border rounded-lg px-4 py-2"
      />
      <button
        onClick={() => onSearch(query, "Search")}
        className="px-4 py-2 bg-black text-white rounded-lg"
      >
        Go
      </button>
    </div>
  );
}
