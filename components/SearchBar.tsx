"use client";

import { useState, useRef, useEffect } from "react";

export type AIToolType = "text" | "image" | "video" | "ocr" | "document" | "dashboard";

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  base64?: string;
  tool: AIToolType;
}

interface ToolOption {
  type: AIToolType;
  label: string;
  icon: string;
  description: string;
}

interface AIModel {
  id: string;
  label: string;
  provider: string;
  modes: Array<"text" | AIToolType>;
  description?: string;
}

const TOOL_OPTIONS: ToolOption[] = [
  {
    type: "text",
    label: "Text Chat",
    icon: "💬",
    description: "General AI assistant conversation",
  },
  {
    type: "image",
    label: "Image Creation",
    icon: "🎨",
    description: "Generate images with Gemini or Grok",
  },
  {
    type: "video",
    label: "Video Creation",
    icon: "🎬",
    description: "Create videos with Veo or text-to-video",
  },
  {
    type: "ocr",
    label: "OCR",
    icon: "📄",
    description: "Extract text from images",
  },
  {
    type: "document",
    label: "Document Generation",
    icon: "📝",
    description: "Generate PDF, DOCX, Markdown",
  },
  {
    type: "dashboard",
    label: "Dashboard",
    icon: "📊",
    description: "View analytics and statistics",
  },
];

const AI_MODELS: AIModel[] = [
  { id: "auto", label: "Auto - Best Available", provider: "Auto", modes: ["text", "image", "video", "ocr", "document"], description: "Smart routing picks the best model for your query" },
  { id: "google-vision-ocr", label: "Simple response", provider: "OCR", modes: ["ocr"], description: "Basic OCR text extraction" },
  { id: "ocr-extended-response", label: "Extended Response", provider: "AI", modes: ["ocr"], description: "Extract text, then generate a detailed educational explanation" },
  // IMAGE MODELS
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "Google", modes: ["image"], description: "Fast, high-quality image generation" },
  { id: "imagen-4.0-generate-001", label: "Imagen 4.0 Generate", provider: "Google", modes: ["image"], description: "Google's premium image model — photorealistic" },
  { id: "grok-imagine-image", label: "Grok Imagine Image", provider: "xAI", modes: ["image"], description: "Creative & unrestricted image generation" },
  { id: "grok-imagine-image-pro", label: "Grok Imagine Image Pro", provider: "xAI", modes: ["image"], description: "Higher quality, detailed image results" },
  // VIDEO MODELS
  { id: "veo-3.1-generate-preview", label: "Veo 3.1 (Gemini)", provider: "Google", modes: ["video"], description: "Latest video generation with audio" },
  { id: "veo-2.0-generate-001", label: "Veo 2.0 (Gemini)", provider: "Google", modes: ["video"], description: "Stable video generation — good for simple clips" },
  { id: "grok-imagine-video", label: "Grok Imagine Video (xAI)", provider: "xAI", modes: ["video"], description: "Creative short video generation" },
  // CHAT MODELS
  { id: "gpt-4", label: "GPT-4 Turbo", provider: "OpenAI", modes: ["text", "document"], description: "Best for complex reasoning & analysis" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo (Router)", provider: "OpenAI", modes: ["text", "document"], description: "High-quality routed text model" },
  { id: "gpt-3.5", label: "GPT-3.5 Turbo", provider: "OpenAI", modes: ["text", "document"], description: "Fast & cost-effective for simple queries" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Router)", provider: "OpenAI", modes: ["text", "document"], description: "Budget routed text model" },
  { id: "claude-opus", label: "Claude 3 Opus", provider: "Anthropic", modes: ["text", "document"], description: "Most capable — deep research & writing" },
  { id: "claude-3-opus", label: "Claude 3 Opus (Registry)", provider: "Anthropic", modes: ["text", "document"], description: "Registry text model id" },
  { id: "claude-sonnet", label: "Claude 3 Sonnet", provider: "Anthropic", modes: ["text", "document"], description: "Balanced — great for most tasks" },
  { id: "claude-3-sonnet", label: "Claude 3 Sonnet (Registry)", provider: "Anthropic", modes: ["text", "document"], description: "Registry text model id" },
  { id: "claude-haiku", label: "Claude 3 Haiku", provider: "Anthropic", modes: ["text", "document"], description: "Fastest Claude — quick answers & summaries" },
  { id: "claude-3-haiku", label: "Claude 3 Haiku (Registry)", provider: "Anthropic", modes: ["text", "document"], description: "Registry text model id" },
  { id: "gemini-pro", label: "Gemini 1.5 Pro", provider: "Google", modes: ["text", "document"], description: "Long context & multimodal — best for large docs" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro (Registry)", provider: "Google", modes: ["text", "document"], description: "Registry text model id" },
  { id: "gemini-flash", label: "Gemini 1.5 Flash", provider: "Google", modes: ["text", "document"], description: "Ultra-fast with good accuracy" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash (Registry)", provider: "Google", modes: ["text", "document"], description: "Registry text model id" },
  { id: "grok-1", label: "Grok-1", provider: "xAI", modes: ["text", "document"], description: "Real-time knowledge & witty responses" },
  { id: "grok-3", label: "Grok-3", provider: "xAI", modes: ["text", "document"], description: "Latest xAI routed text model" },
];

export { type AttachedFile };

interface SearchBarProps {
  onSearch: (query: string, attachments?: AttachedFile[]) => void;
  onNewTopic?: () => void;
  onToolSelect?: (tool: string) => void;
  onModelChange?: (model: string) => void;
  onMicClick?: () => void;
  onConfigChange?: (config: { imageConfig?: Record<string, string>; videoConfig?: Record<string, number | string> }) => void;
  selectedTool?: string | null;
  selectedModel?: string;
  disabledModelIds?: string[];
  disabledToolIds?: string[];
  enabledModelsByTool?: Record<string, string[]>;
  currentMode?: string; // 'text' | 'image' | 'video' | 'ocr' | 'document'
  preferredTextProvider?: string; // 'auto' | 'openai' | 'claude-sonnet' | 'gemini' | 'xai'
  disabled?: boolean;
  placeholder?: string;
  isNewChat?: boolean;
  isListening?: boolean;
  prefillQuery?: string;
}

export default function SearchBar({
  onSearch,
  onNewTopic,
  onToolSelect,
  onModelChange,
  onMicClick,
  onConfigChange,
  selectedTool,
  selectedModel = "auto",
  disabledModelIds = [],
  disabledToolIds = [],
  enabledModelsByTool = {},
  currentMode = "text",
  preferredTextProvider = "auto",
  disabled = false,
  placeholder = "Ask a story, case, or question...",
  isNewChat = true,
  isListening = false,
  prefillQuery,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<AIModel[]>(AI_MODELS);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [imageConfig, setImageConfig] = useState({ size: '1024x1024', quality: 'standard', style: 'natural' });
  const [videoConfig, setVideoConfig] = useState({ duration: 5, resolution: '1080p', aspectRatio: '16:9' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof prefillQuery === 'string') {
      setQuery(prefillQuery);
    }
  }, [prefillQuery]);

  useEffect(() => {
    let isMounted = true;

    const loadModels = async () => {
      try {
        const response = await fetch('/api/chronoread/models', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json() as {
          models?: Array<{
            id: string;
            displayName?: string;
            provider?: string;
            description?: string;
            categories?: string[];
          }>;
        };

        const toModes = (categories: string[] = []): Array<"text" | AIToolType> => {
          const modes = new Set<Array<"text" | AIToolType>[number]>();
          categories.forEach((category) => {
            const normalized = String(category || '').toLowerCase();
            if (normalized === 'text' || normalized === 'vision') {
              modes.add('text');
              modes.add('document');
            }
            if (normalized === 'image') modes.add('image');
            if (normalized === 'video') modes.add('video');
            if (normalized === 'ocr') modes.add('ocr');
          });
          return modes.size ? Array.from(modes) : ['text'];
        };

        const apiModels: AIModel[] = Array.isArray(payload.models)
          ? payload.models.map((model) => ({
              id: model.id,
              label: model.displayName || model.id,
              provider: model.provider || 'AI',
              modes: toModes(model.categories || []),
              description: model.description,
            }))
          : [];

        if (!isMounted) return;

        const merged = [
          ...AI_MODELS,
          ...apiModels,
        ].reduce<AIModel[]>((acc, model) => {
          if (!acc.find((entry) => entry.id.toLowerCase() === model.id.toLowerCase())) {
            acc.push(model);
          }
          return acc;
        }, []);

        setAvailableModels(merged);
      } catch {
      }
    };

    void loadModels();

    return () => {
      isMounted = false;
    };
  }, []);

  // Calculate line count
  const lineCount = query.split("\n").length;
  const shouldShowExpandButton = lineCount > 5;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 300);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [query]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        toolMenuRef.current &&
        !toolMenuRef.current.contains(event.target as Node)
      ) {
        setIsToolMenuOpen(false);
      }
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(event.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = () => {
    if (!query.trim() || disabled) return;
    onSearch(query, attachedFiles);
    setQuery("");
    setIsExpanded(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const supportedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'gif'];
    
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !supportedExtensions.includes(ext)) {
        alert(`File type .${ext} not supported. Please use: ${supportedExtensions.join(', ')}`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const base64Payload = base64.split(',')[1];
        if (!base64Payload) return;

        const newFile: AttachedFile = {
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          base64: base64Payload,
          tool: selectedTool as AIToolType || 'image',
        };
        setAttachedFiles((prev) => {
          const duplicateExists = prev.some((existing) => (
            existing.name === file.name
            && existing.size === file.size
            && existing.base64 === base64Payload
          ));
          if (duplicateExists) return prev;
          return [...prev, newFile];
        });
      };
      reader.readAsDataURL(file);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfigChange = () => {
    onConfigChange?.({ imageConfig, videoConfig });
    setShowConfigModal(false);
  };

  const clearAttachments = () => {
    setAttachedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNewTopicClick = () => {
    clearAttachments();
    onNewTopic?.();
  };

  const handleToolClick = (tool: string) => {
    clearAttachments();
    if (tool === "text") {
      onToolSelect?.("text");
    } else {
      onToolSelect?.(tool);
    }
    setIsToolMenuOpen(false);
  };

  const handleModelChange = (modelId: string) => {
    onModelChange?.(modelId);
    setIsModelMenuOpen(false);
  };

  const handleExpandToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const currentModel = availableModels.find((m) => m.id === selectedModel) || availableModels[0];

  const normalizeModelId = (value: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    const aliases: Record<string, string> = {
      'gemini-1.5-flash': 'gemini-flash',
      'gemini-2.5-flash': 'gemini-flash',
      'gemini-flash': 'gemini-flash',
      'gemini-1.5-pro': 'gemini-pro',
      'gemini-pro': 'gemini-pro',
      'gpt-4-turbo': 'gpt-4',
      'gpt-4': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5',
      'gpt-3.5': 'gpt-3.5',
      'claude-3-sonnet': 'claude-sonnet',
      'claude-sonnet': 'claude-sonnet',
      'claude-3-opus': 'claude-opus',
      'claude-opus': 'claude-opus',
      'claude-3-haiku': 'claude-haiku',
      'claude-haiku': 'claude-haiku',
      'grok-1': 'grok-3',
      'grok-3': 'grok-3',
    };
    return aliases[normalized] || normalized;
  };

  // Get recommended models based on current mode
  const getModeRecommendedModels = () => {
    const activeMode: "text" | AIToolType =
      currentMode === "image" || currentMode === "video" || currentMode === "ocr" || currentMode === "document" || currentMode === "text"
        ? currentMode
        : "text";

    const modeModels = availableModels.filter((model) => model.modes.includes(activeMode));

    const toolForRestriction = String(
      currentMode && currentMode !== "text"
        ? currentMode
        : "text"
    ).toLowerCase();
    const enabledForTool = Array.isArray(enabledModelsByTool?.[toolForRestriction])
      ? enabledModelsByTool[toolForRestriction]
      : Array.isArray(enabledModelsByTool?.text)
        ? enabledModelsByTool.text
        : null;

    const withAdminCustomModels = (() => {
      if (!enabledForTool || enabledForTool.length === 0) return modeModels;

      const existingIds = new Set(modeModels.map((model) => model.id.toLowerCase()));
      const customModels: AIModel[] = enabledForTool
        .filter((modelId) => !existingIds.has(modelId.toLowerCase()))
        .map((modelId) => ({
          id: modelId,
          label: modelId,
          provider: "Admin",
          modes: [activeMode],
          description: "Enabled by super admin",
        }));

      return [...modeModels, ...customModels];
    })();

    const restrictedModeModels = enabledForTool && enabledForTool.length > 0
      ? withAdminCustomModels.filter((model) => model.id === "auto" || enabledForTool.includes(model.id.toLowerCase()))
      : withAdminCustomModels;

    if (activeMode === 'ocr') {
      const requiredOcrModelIds = new Set(['auto', 'google-vision-ocr', 'ocr-extended-response']);
      const requiredOcrDefaults = AI_MODELS.filter((model) => requiredOcrModelIds.has(model.id));

      const mergedOcrModels = [...restrictedModeModels, ...requiredOcrDefaults].reduce<AIModel[]>((acc, model) => {
        if (!acc.some((entry) => entry.id.toLowerCase() === model.id.toLowerCase())) {
          acc.push(model);
        }
        return acc;
      }, []);

      return mergedOcrModels.filter((model) => requiredOcrModelIds.has(model.id));
    }

    if (activeMode !== "text" || preferredTextProvider === "auto") {
      return restrictedModeModels;
    }

    const isProviderMatch = (modelId: string) => {
      if (modelId === 'auto') return true;
      if (preferredTextProvider === 'openai') return modelId.startsWith('gpt-');
      if (preferredTextProvider === 'claude-sonnet') return modelId.startsWith('claude-');
      if (preferredTextProvider === 'gemini') return modelId.startsWith('gemini-');
      if (preferredTextProvider === 'xai') return modelId.startsWith('grok-');
      return true;
    };

    return restrictedModeModels.filter((model) => isProviderMatch(model.id));
  };

  const recommendedModels = getModeRecommendedModels();
  const toolForRestriction = String(
    currentMode && currentMode !== "text"
      ? currentMode
      : "text"
  ).toLowerCase();
  const enabledForCurrentTool = Array.isArray(enabledModelsByTool?.[toolForRestriction])
    ? enabledModelsByTool[toolForRestriction]
    : Array.isArray(enabledModelsByTool?.text)
      ? enabledModelsByTool.text
      : [];
  const normalizedEnabledForTool = enabledForCurrentTool.map((modelId) => normalizeModelId(modelId));
  const isAdminEnabledModel = (modelId: string) => {
    if (!normalizedEnabledForTool.length) return false;
    return normalizedEnabledForTool.includes(normalizeModelId(modelId));
  };
  const normalizedDisabledIds = disabledModelIds.map((modelId) => normalizeModelId(modelId));
  const shouldShowSessionWarning = selectedTool === 'dashboard' || selectedTool === 'document';
  const shouldShowModelSelector = selectedTool !== 'dashboard';

  useEffect(() => {
    if (!recommendedModels.some((model) => model.id === selectedModel)) {
      onModelChange?.('auto');
    }
  }, [recommendedModels, selectedModel, onModelChange]);

  return (
    <div className="relative w-full min-w-0 flex flex-col gap-2">
      {shouldShowSessionWarning && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-200"
          role="status"
          aria-live="polite"
        >
          Note: Generated results are not persisted to the database and will no longer be available after this session ends.
        </div>
      )}

      {/* Main Search Bar Container */}
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl transition-all hover:border-[var(--muted-strong)] focus-within:border-[var(--foreground)]">
        {/* Top Row: + Button and Controls */}
        <div className="flex items-center gap-1.5 p-2">
          <div className="min-w-0 flex-1">
            <div className="flex w-full min-w-0 items-center gap-1.5 pr-1">
              {onNewTopic && (
                <button
                  type="button"
                  onClick={handleNewTopicClick}
                  disabled={disabled}
                  className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  title="New topic"
                  aria-label="Start new topic"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}

              {isNewChat && (
                <div className="relative flex-shrink-0" ref={toolMenuRef}>
                  <button
                    onClick={() => setIsToolMenuOpen(!isToolMenuOpen)}
                    disabled={disabled}
                    className={`p-1.5 rounded-lg border transition-all ${
                      isToolMenuOpen
                        ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)]"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="New Chat with Tools"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>

                  {isToolMenuOpen && (
                    <div className="fixed left-[max(0.5rem,env(safe-area-inset-left))] right-[max(0.5rem,env(safe-area-inset-right))] bottom-24 z-[1200] max-h-[min(20rem,calc(100dvh-8rem))] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden overscroll-contain sm:absolute sm:bottom-full sm:mb-2 sm:left-0 sm:right-auto sm:w-64">
                      <div className="px-3 py-2 border-b border-[var(--border)]">
                        <p className="text-xs uppercase tracking-wider text-[var(--muted)] font-semibold">New Session</p>
                      </div>
                      <div className="py-1 max-h-[min(18rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain">
                        {TOOL_OPTIONS.filter((tool) => tool.type !== "text").map((tool) => {
                          const isDisabledTool = disabledToolIds.includes(tool.type);
                          return (
                          <button
                            key={tool.type}
                            onClick={() => {
                              if (!isDisabledTool) {
                                handleToolClick(tool.type);
                              }
                            }}
                            disabled={isDisabledTool}
                            className={`w-full text-left px-3 py-2 transition-colors text-sm ${
                              isDisabledTool
                                ? "opacity-50 cursor-not-allowed text-[var(--muted)]"
                                : "hover:bg-[var(--surface-strong)]"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-lg mt-0.5 flex-shrink-0">{tool.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-[var(--foreground)]">{tool.label}</p>
                                <p className="text-xs text-[var(--muted)] truncate">
                                  {tool.description}
                                  {isDisabledTool ? " (Disabled by admin)" : ""}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentMode !== 'document' && (
              <div className="relative flex-shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.gif"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  className={`p-1.5 rounded-lg border transition-all ${
                    attachedFiles.length > 0
                      ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)]"
                  } disabled:opacity-50 disabled:cursor-not-allowed relative`}
                  title="Attach Files"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4h-4l6-6 6 6h-4z" />
                  </svg>
                  {attachedFiles.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {attachedFiles.length}
                    </span>
                  )}
                </button>
              </div>
              )}

              {(currentMode === 'image' || currentMode === 'video') && (
                <button
                  onClick={() => setShowConfigModal(!showConfigModal)}
                  disabled={disabled}
                  className={`p-1.5 rounded-lg border transition-all ${
                    showConfigModal
                      ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)]"
                  } disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0`}
                  title="Generation Settings"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}

              {shouldShowModelSelector && (
              <div className="relative min-w-0 flex-shrink" ref={modelMenuRef}>
                <button
                  onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                  disabled={disabled}
                  className={`inline-flex min-w-0 max-w-[11rem] items-center px-2 py-1.5 rounded-lg border text-xs font-medium transition-all whitespace-nowrap max-[420px]:max-w-[8.5rem] max-[360px]:max-w-[6.5rem] sm:max-w-xs ${
                    isModelMenuOpen
                      ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)]"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={currentModel?.label || "Model"}
                >
                  <svg className="mr-1 h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 10l-4.293-4.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="block max-w-full truncate">{currentModel?.label || "Model"}</span>
                </button>

                {isModelMenuOpen && (
                  <div className="fixed left-[max(0.5rem,env(safe-area-inset-left))] right-[max(0.5rem,env(safe-area-inset-right))] bottom-24 z-[1200] max-h-[min(20rem,calc(100dvh-8rem))] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden overscroll-contain sm:absolute sm:bottom-full sm:mb-2 sm:left-0 sm:right-auto sm:w-72">
                    <div className="px-3 py-2 border-b border-[var(--border)]">
                      <p className="text-xs uppercase tracking-wider text-[var(--muted)] font-semibold">
                        {currentMode && currentMode !== "text"
                          ? `${currentMode.toUpperCase()} - Recommended Models`
                          : "AI Model"}
                      </p>
                    </div>
                    <div className="py-1 max-h-[min(18rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain">
                      {recommendedModels.map((model) => {
                        const isDisabledModel = normalizedDisabledIds.includes(normalizeModelId(model.id)) && !isAdminEnabledModel(model.id);
                        return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            if (!isDisabledModel) {
                              handleModelChange(model.id);
                            }
                          }}
                          disabled={isDisabledModel}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            selectedModel === model.id
                              ? "bg-[var(--foreground)] text-[var(--background)] font-medium"
                              : isDisabledModel
                                ? "text-[var(--muted)] opacity-50 cursor-not-allowed"
                                : "hover:bg-[var(--surface-strong)] text-[var(--foreground)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{model.label}</span>
                            <span
                              className={`text-xs whitespace-nowrap flex-shrink-0 ${
                                selectedModel === model.id ? "opacity-100" : "text-[var(--muted)] opacity-60"
                              }`}
                            >
                              {isDisabledModel ? `${model.provider} (Unavailable)` : model.provider}
                            </span>
                          </div>
                          {model.description && (
                            <p className={`text-[10px] mt-0.5 leading-tight ${
                              selectedModel === model.id ? "opacity-70" : "text-[var(--muted)] opacity-50"
                            }`}>
                              {model.description}
                            </p>
                          )}
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {onMicClick && (
              <button
                onClick={onMicClick}
                disabled={disabled}
                className={`p-1.5 rounded-lg border transition-all flex-shrink-0 ${
                  isListening
                    ? "bg-red-500 text-white border-red-500 animate-pulse"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)]"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Voice Input"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1C6.48 1 2 4.58 2 9v10c0 4.42 4.48 8 10 8s10-3.58 10-8V9c0-4.42-4.48-8-10-8zm0 18c-4.41 0-8-2.91-8-6.5S7.59 4 12 4s8 2.91 8 6.5S16.41 19 12 19zm0-9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                </svg>
              </button>
            )}

            {shouldShowExpandButton && !isExpanded && (
              <button
                onClick={handleExpandToggle}
                className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-all flex-shrink-0"
                title="Expand"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 16V4m0 0L3 8m4-4l4 4m6-4v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
              </button>
            )}

            <button
              onClick={handleSearch}
              disabled={!query.trim() || disabled}
              className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${
                query.trim() && !disabled
                  ? "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
                  : "bg-[var(--surface-strong)] text-[var(--muted)] cursor-not-allowed"
              }`}
              title="Send (Enter)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="px-2 pb-2">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
              }
            }}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--muted)] resize-none focus:outline-none transition-all ${
              isExpanded ? "min-h-96" : "min-h-10 max-h-32"
            }`}
            style={{ height: "auto" }}
          />
        </div>

        {/* Collapse Button (when expanded) */}
        {isExpanded && (
          <div className="flex justify-center p-2 border-t border-[var(--border)]">
            <button
              onClick={handleExpandToggle}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-all flex-shrink-0"
              title="Collapse"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Attached Files Display */}
      {attachedFiles.length > 0 && (
        <div className="px-2">
          <div className="text-xs text-[var(--muted)] mb-1.5">Attachments ({attachedFiles.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-strong)] border border-[var(--border)]"
              >
                <span className="text-xs text-[var(--foreground)] truncate max-w-xs">{file.name}</span>
                <button
                  onClick={() => setAttachedFiles(prev => prev.filter(f => f.id !== file.id))}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  title="Remove"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {showConfigModal && (currentMode === 'image' || currentMode === 'video') && (
        <div className="px-2 py-2 border-t border-[var(--border)] bg-[var(--surface-strong)] rounded-b-xl">
          {currentMode === 'image' && (
            <div className="space-y-2.5">
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">Image Size</label>
                <select
                  value={imageConfig.size}
                  onChange={(e) => setImageConfig(prev => ({ ...prev, size: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]"
                >
                  <option value="256x256">256x256 (Fast)</option>
                  <option value="512x512">512x512</option>
                  <option value="1024x1024">1024x1024 (Default)</option>
                  <option value="1792x1024">1792x1024 (Wide)</option>
                  <option value="1024x1792">1024x1792 (Tall)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">Quality</label>
                <select
                  value={imageConfig.quality}
                  onChange={(e) => setImageConfig(prev => ({ ...prev, quality: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]"
                >
                  <option value="standard">Standard</option>
                  <option value="hd">HD (Slower)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">Style</label>
                <select
                  value={imageConfig.style}
                  onChange={(e) => setImageConfig(prev => ({ ...prev, style: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]"
                >
                  <option value="natural">Natural</option>
                  <option value="vivid">Vivid</option>
                </select>
              </div>
            </div>
          )}

          {currentMode === 'video' && (
            <div className="space-y-2.5">
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">Duration (seconds)</label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={videoConfig.duration}
                  onChange={(e) => setVideoConfig(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                  className="w-full mt-1 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">Resolution</label>
                <select
                  value={videoConfig.resolution}
                  onChange={(e) => setVideoConfig(prev => ({ ...prev, resolution: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]"
                >
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p (Default)</option>
                  <option value="4k">4K (Slow)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">Aspect Ratio</label>
                <select
                  value={videoConfig.aspectRatio}
                  onChange={(e) => setVideoConfig(prev => ({ ...prev, aspectRatio: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]"
                >
                  <option value="16:9">16:9 (Widescreen)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>
            </div>
          )}

          <button
            onClick={handleConfigChange}
            className="w-full mt-2 px-3 py-1.5 bg-[var(--foreground)] text-[var(--background)] rounded text-xs font-medium hover:opacity-90 transition-all"
          >
            Apply Settings
          </button>
        </div>
      )}
    </div>
  );
}
