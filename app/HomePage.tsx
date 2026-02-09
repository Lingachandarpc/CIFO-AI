// app/page.tsx
"use client";

import { useState } from "react";
import SearchBar from "../components/SearchBar";
import ContentRow from "../components/ContentRow";
import NarrationModal from "../components/NarrationModal";

export default function Home() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");

  const handleSelect = (item: string) => {
    setContent(
      `This is a narrated insight about "${item}". 
It adapts tone based on the emotional core of the story.
You can interrupt, reflect, or challenge this idea.`
    );
    setOpen(true);
  };

  return (
    <main className="px-6 py-10">
      {/* Center Search */}
      <div className="flex justify-center mb-16">
        <SearchBar onSearch={() => setOpen(true)} />
      </div>

      {/* Netflix Layout */}
      {/* <ContentRow
        title="Case Studies"
        items={["Airbnb", "Netflix", "Zomato", "Tesla"]}
        onSelect={handleSelect}
      />

      <ContentRow
        title="Real Life Stories"
        items={["Failure to Success", "Career Switch", "Burnout Recovery"]}
        onSelect={handleSelect}
      />

      <ContentRow
        title="Books"
        items={["Atomic Habits", "Deep Work", "Psychology of Money"]}
        onSelect={handleSelect}
      /> */}

      <NarrationModal
        open={open}
        content={content}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
