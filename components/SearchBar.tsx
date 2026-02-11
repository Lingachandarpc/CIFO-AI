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
        className="flex-1 bg-gray-900 border border-gray-700 hover:border-lime-400/30 focus:border-lime-400 rounded-lg px-5 py-3 text-white placeholder-gray-500 focus:outline-none transition-colors text-lg"
      />
      <button
        onClick={() => onSearch(query, "Search")}
        className="px-6 py-3 bg-lime-400 text-black font-bold rounded-lg hover:bg-lime-300 active:bg-lime-500 transition-all duration-150 transform hover:scale-105"
      >
        SEARCH
      </button>
      <button
        onClick={() => onSearch(query, "Ask")}
        className="px-4 py-3 ml-2 bg-neutral-800 text-white font-bold rounded-lg hover:bg-neutral-700 transition-all duration-150"
      >
        ASK
      </button>
    </div>
  );
}
