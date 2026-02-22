'use client';

import React from 'react';

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  base64?: string;
  tool: 'image' | 'video' | 'ocr' | 'document';
}

interface FileAttachmentProps {
  files: AttachedFile[];
  onRemove?: (fileId: string) => void;
  onViewDetails?: (file: AttachedFile) => void;
  readOnly?: boolean;
}

export default function FileAttachment({
  files,
  onRemove,
  onViewDetails,
  readOnly = false,
}: FileAttachmentProps) {
  if (files.length === 0) return null;

  const getFileIcon = (file: AttachedFile) => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type.startsWith('video/')) return '🎬';
    if (file.type === 'application/pdf') return '📕';
    if (file.type.includes('document')) return '📄';
    return '📎';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="w-full space-y-2 my-3 p-3 rounded-lg bg-[var(--surface-strong)] border border-[var(--border)]">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-[var(--muted)] font-semibold">
          Attachments ({files.length})
        </span>
        {!readOnly && (
          <span className="text-[10px] text-[var(--muted)] ml-auto">
            {files.length} file(s) selected
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-2.5 p-2 rounded bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted-strong)] transition-colors"
          >
            {/* File Icon */}
            <span className="text-lg flex-shrink-0">{getFileIcon(file)}</span>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--foreground)] truncate">
                {file.name}
              </p>
              <p className="text-[10px] text-[var(--muted)]">
                {formatFileSize(file.size)} • {file.tool}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {onViewDetails && (
                <button
                  onClick={() => onViewDetails(file)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-strong)] transition-colors"
                  title="View details"
                  aria-label={`View details for ${file.name}`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
              )}

              {onRemove && !readOnly && (
                <button
                  onClick={() => onRemove(file.id)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-strong)] transition-colors"
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Info Text */}
      <div className="mt-2 pt-2 border-t border-[var(--border)] text-[10px] text-[var(--muted)]">
        <p>Files attached to your request will be processed with the selected AI tool</p>
      </div>
    </div>
  );
}
