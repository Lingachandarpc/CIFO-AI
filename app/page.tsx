"use client";

import { useEffect, useState } from "react";
import SearchBar from "@/components/SearchBar";
import NarrationModal from "@/components/NarrationModal";
import ContentRow from "@/components/ContentRow";

type Item = {
  title: string;
  image: string;
};

type DiscoveryData = Record<string, Item[]>;

export default function Home() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryData>({});

  // 🔁 Load discover content on every reload
  useEffect(() => {
    const loadDiscovery = async () => {
      try {
        const res = await fetch("/api/chronoread/discover");
        const data = await res.json();
        setDiscovery(data);
      } catch (err) {
        console.error("Discover API failed", err);
      }
    };

    loadDiscovery();
  }, []);

  // 🎙️ Generate narration
  const fetchNarration = async (query: string, category: string) => {
    setLoading(true);
    setOpen(true);
    setContent("Thinking…");

    try {
      const res = await fetch("/api/chronoread/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, category }),
      });

      const data = await res.json();
      setContent(data.narration || "No narration generated.");
    } catch (err) {
      console.error("AI API failed", err);
      setContent("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="px-6 py-10 space-y-14">
      {/* 🔍 Search */}
      <div className="flex justify-center">
        <SearchBar onSearch={fetchNarration} />
      </div>

      {/* 🎬 Discover Rows */}
      {Object.entries(discovery).map(([category, items]) => (
        <ContentRow
          key={category}
          title={category}
          items={items}
          onSelect={(item) => fetchNarration(item.title, category)}
        />
      ))}

      {/* 🎧 Narration Modal */}
      <NarrationModal
        open={open}
        content={content}
        // loading={loading}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
