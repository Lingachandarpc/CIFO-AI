"use client";

import * as Dialog from '@radix-ui/react-dialog';

type MediaType = 'image' | 'video';

interface MediaEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaType: MediaType;
  mediaUrl: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onRegenerate: () => void;
  onDownload: () => void;
  isBusy: boolean;
}

export default function MediaEditorDialog({
  open,
  onOpenChange,
  mediaType,
  mediaUrl,
  prompt,
  onPromptChange,
  onRegenerate,
  onDownload,
  isBusy,
}: MediaEditorDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-sm sm:text-base font-semibold text-[var(--foreground)]">
              {mediaType === 'image' ? 'Image Editor' : 'Video Editor'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Close
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden">
            {mediaType === 'image' ? (
              <img
                src={mediaUrl}
                alt="Generated"
                className="w-full max-h-[56vh] object-contain"
              />
            ) : (
              <video
                src={mediaUrl}
                controls
                className="w-full max-h-[56vh]"
              />
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2">
              Edit prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              className="w-full min-h-24 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] focus:outline-none"
              placeholder={mediaType === 'image' ? 'Refine this image prompt...' : 'Refine this video prompt...'}
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDownload}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs sm:text-sm text-[var(--foreground)] hover:bg-[var(--surface-strong)]"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isBusy || !prompt.trim()}
              className="rounded-lg bg-[var(--foreground)] px-3 py-2 text-xs sm:text-sm text-[var(--background)] disabled:opacity-60"
            >
              {isBusy ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
