"use client";

type Props = {
  open: boolean;
  content: string;
  onClose: () => void;
};

export default function NarrationModal({
  open,
  content,
  onClose,
}: Props) {
  if (!open) return null;

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "en-US";
    utterance.rate = 1;
    speechSynthesis.cancel(); // stop previous
    speechSynthesis.speak(utterance);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4">
        <p className="text-gray-700 whitespace-pre-line">{content}</p>

        <div className="flex justify-between">
          <button
            onClick={speak}
            className="px-4 py-2 bg-black text-white rounded-lg"
          >
            ▶ Play
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
