'use client';

import React, { useState, useRef } from 'react';

export type AIToolType = 'image' | 'video' | 'ocr' | 'document' | 'dashboard';

interface AIToolsMenuProps {
  onToolSelect: (tool: AIToolType, file?: File) => void;
  isLoading?: boolean;
}

interface ToolOption {
  type: AIToolType;
  label: string;
  icon: string;
  description: string;
  fileAccept?: string;
  multipleFiles?: boolean;
}

const TOOL_OPTIONS: ToolOption[] = [
  {
    type: 'image',
    label: 'Image Creation',
    icon: '🎨',
    description: 'Generate images from text descriptions',
    fileAccept: 'image/*',
  },
  {
    type: 'video',
    label: 'Video Creation',
    icon: '🎬',
    description: 'Create videos from text or images',
    fileAccept: 'image/*,video/*',
  },
  {
    type: 'ocr',
    label: 'OCR',
    icon: '📄',
    description: 'Extract text from images and documents',
    fileAccept: 'image/*,application/pdf',
  },
  {
    type: 'document',
    label: 'Document Generation',
    icon: '📝',
    description: 'Generate PDF, DOCX, or Markdown documents',
  },
  {
    type: 'dashboard',
    label: 'Dashboard',
    icon: '📊',
    description: 'View analytics and statistics',
  },
];

export default function AIToolsMenu({ onToolSelect, isLoading = false }: AIToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AIToolType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToolClick = (tool: ToolOption) => {
    setSelectedTool(tool.type);

    // If tool requires file input, trigger file picker
    if (tool.fileAccept) {
      if (fileInputRef.current) {
        fileInputRef.current.accept = tool.fileAccept;
        fileInputRef.current.multiple = tool.multipleFiles || false;
        fileInputRef.current.click();
      }
    } else {
      // Tool doesn't require file (e.g., dashboard)
      onToolSelect(tool.type);
      setIsOpen(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && selectedTool) {
      const file = files[0];
      onToolSelect(selectedTool, file);
      setIsOpen(false);
      setSelectedTool(null);
    }
    // Reset file input
    event.target.value = '';
  };

  return (
    <div className="relative">
      {/* Plus Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={`inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg transition-all ${
          isOpen
            ? 'bg-[var(--foreground)] text-[var(--background)]'
            : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-strong)]'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title="AI Tools"
        aria-label="Open AI tools menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 sm:left-auto sm:right-0 z-50 min-w-max">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden">
            {/* Menu Header */}
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="text-xs uppercase tracking-widest text-[var(--muted)] font-semibold">
                AI Tools
              </p>
            </div>

            {/* Menu Items */}
            <div className="py-2 max-h-96 overflow-y-auto">
              {TOOL_OPTIONS.map((tool, index) => (
                <button
                  key={tool.type}
                  onClick={() => handleToolClick(tool)}
                  className={`w-full px-4 py-2.5 text-left hover:bg-[var(--surface-strong)] transition-colors border-b border-transparent hover:border-b hover:border-[var(--border)] text-sm ${
                    index === TOOL_OPTIONS.length - 1 ? 'border-b-0' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{tool.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-[var(--foreground)] text-sm">
                        {tool.label}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {tool.description}
                      </p>
                      {tool.fileAccept && (
                        <p className="text-[10px] text-[var(--muted-strong)] mt-1">
                          requires file
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Menu Footer */}
            <div className="px-4 py-2 bg-[var(--surface-strong)] border-t border-[var(--border)] text-[10px] text-[var(--muted)]">
              <p>Select a tool to get started</p>
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="File input for AI tools"
      />
    </div>
  );
}
