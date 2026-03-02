"use client";

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';

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
  const [isExpandedView, setIsExpandedView] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const toggleFullscreen = () => {
    setIsExpandedView((prev) => !prev);
  };

  const handleCopyHtml = async () => {
    try {
      const response = await fetch(dashboardUrl);
      if (!response.ok) throw new Error(`Failed with ${response.status}`);
      const html = await response.text();
      await navigator.clipboard.writeText(html);
      setCopyState('copied');
    } catch {
      try {
        await navigator.clipboard.writeText(dashboardUrl);
        setCopyState('copied');
      } catch {
        setCopyState('failed');
      }
    }

    window.setTimeout(() => {
      setCopyState('idle');
    }, 1800);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[520] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className={`fixed z-[521] overflow-hidden bg-[var(--surface)] shadow-2xl ${
            isExpandedView
              ? 'inset-0 h-[100dvh] w-screen rounded-none border-0'
              : 'inset-0 h-[100dvh] w-screen rounded-none border-0 md:inset-auto md:left-1/2 md:top-1/2 md:h-[92vh] md:w-[96vw] md:max-w-[1400px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-[var(--border)]'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <Dialog.Title className="text-sm sm:text-base font-semibold text-[var(--foreground)] truncate">
              {title || 'AI Dashboard'}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleCopyHtml();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                title="Copy HTML"
                aria-label="Copy HTML"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16h8M8 12h8m-8-4h8M6 20h12a2 2 0 002-2V6l-4-4H6a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>{copyState === 'copied' ? 'HTML Copied' : copyState === 'failed' ? 'Copy Failed' : 'Copy HTML'}</span>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                title={isExpandedView ? 'Exit fullscreen' : 'Fullscreen'}
                aria-label={isExpandedView ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isExpandedView ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H4V4m11 5h5V4M9 15H4v5m11-5h5v5" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />
                  </svg>
                )}
              </button>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Close
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className={`w-full bg-[var(--background)] ${isExpandedView ? 'h-[calc(100dvh-52px)]' : 'h-[calc(100dvh-52px)] md:h-[calc(92vh-52px)]'}`}>
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
