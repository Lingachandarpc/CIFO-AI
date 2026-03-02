"use client";

import * as Dialog from '@radix-ui/react-dialog';

interface DashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardUrl: string;
  title?: string;
}

export default function DashboardDialog({
  open,
  onOpenChange,
  dashboardUrl,
  title,
}: DashboardDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[520] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-[521] h-[100dvh] w-screen rounded-none border-0 bg-[var(--surface)] shadow-2xl overflow-hidden md:inset-auto md:left-1/2 md:top-1/2 md:h-[92vh] md:w-[96vw] md:max-w-[1400px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-[var(--border)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <Dialog.Title className="text-sm sm:text-base font-semibold text-[var(--foreground)] truncate">
              {title || 'AI Dashboard'}
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

          <div className="h-[calc(100dvh-52px)] w-full bg-[var(--background)] md:h-[calc(92vh-52px)]">
            <iframe
              src={dashboardUrl}
              title={title || 'AI Dashboard'}
              className="h-full w-full border-0"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
