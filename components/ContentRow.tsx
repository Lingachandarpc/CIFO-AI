"use client";

type Item = {
  title: string;
  image: string;
};

type Props = {
  title: string;
  items: Item[];
  onSelect: (item: Item) => void;
};

export default function ContentRow({ title, items, onSelect }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>

      <div className="flex gap-4 overflow-x-auto">
        {items?.map((item) => (
          <div
            key={item.title}
            onClick={() => onSelect(item)}
            className="relative min-w-[220px] h-[120px] rounded-xl overflow-hidden cursor-pointer hover:scale-105 transition"
          >
            <img
              src={item.image}
              alt={item.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-medium px-2 text-center">
              {item.title}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
