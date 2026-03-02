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
  onCancel?: () => void;
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
  onCancel,
  isBusy,
}: MediaEditorDialogProps) {
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(val) => {
      // Prevent closing via overlay/escape while regenerating — use Cancel instead
      if (isBusy && !val) return;
      onOpenChange(val);
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-[500] h-[100dvh] w-screen rounded-none border-0 bg-[var(--surface)] p-4 shadow-2xl overflow-y-auto md:inset-auto md:left-1/2 md:top-1/2 md:w-[94vw] md:max-w-3xl md:h-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-[var(--border)] md:p-4 sm:md:p-5 md:overflow-visible">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-sm sm:text-base font-semibold text-[var(--foreground)]">
              {mediaType === 'image' ? 'Image Editor' : 'Video Editor'}
            </Dialog.Title>
            {!isBusy && (
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Close
                </button>
              </Dialog.Close>
            )}
            {isBusy && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-red-500/50 px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Media preview with scanning loader overlay */}
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden relative">
            {mediaType === 'image' ? (
              <img
                src={mediaUrl}
                alt="Generated"
                className={`w-full max-h-[56vh] object-contain transition-opacity duration-300 ${isBusy ? 'opacity-40' : 'opacity-100'}`}
              />
            ) : (
              <video
                src={mediaUrl}
                controls={!isBusy}
                className={`w-full max-h-[56vh] transition-opacity duration-300 ${isBusy ? 'opacity-40' : 'opacity-100'}`}
              />
            )}

            {/* Scanner loader overlay */}
            {isBusy && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* Grid pattern */}
                <div className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: `linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                  }}
                />
                {/* Scanning line animation */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-lime-400 to-transparent animate-media-scan" />
                {/* Center label */}
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs uppercase tracking-widest text-lime-400 font-semibold">
                    Regenerating
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs uppercase tracking-widest text-[var(--muted)] mb-2">
              Edit prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              disabled={isBusy}
              className="w-full min-h-24 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] focus:outline-none disabled:opacity-50"
              placeholder={mediaType === 'image' ? 'Refine this image prompt...' : 'Refine this video prompt...'}
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDownload}
              disabled={isBusy}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs sm:text-sm text-[var(--foreground)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
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
