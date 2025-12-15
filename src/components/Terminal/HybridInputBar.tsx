import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { buildTerminalSendPayload } from "@/lib/terminalInput";
import { useFileAutocomplete } from "@/hooks/useFileAutocomplete";
import { FileAutocompleteMenu } from "./FileAutocompleteMenu";

const MAX_TEXTAREA_HEIGHT_PX = 160;

export interface HybridInputBarHandle {
  focus: () => void;
}

export interface HybridInputBarProps {
  onSend: (payload: { data: string; trackerData: string; text: string }) => void;
  cwd: string;
  disabled?: boolean;
  className?: string;
}

interface AtFileContext {
  atStart: number;
  tokenEnd: number;
  queryRaw: string;
  queryForSearch: string;
}

function getAtFileContext(text: string, caret: number): AtFileContext | null {
  if (caret < 0 || caret > text.length) return null;
  const beforeCaret = text.slice(0, caret);
  const atStart = beforeCaret.lastIndexOf("@");
  if (atStart === -1) return null;
  if (atStart > 0 && !/\s/.test(beforeCaret[atStart - 1])) return null;

  let tokenEnd = atStart + 1;
  while (tokenEnd < text.length && !/\s/.test(text[tokenEnd])) {
    tokenEnd++;
  }

  if (caret < atStart + 1 || caret > tokenEnd) return null;

  const token = text.slice(atStart + 1, tokenEnd);
  if (/\s/.test(token)) return null;

  const queryRaw = text.slice(atStart + 1, caret);
  const queryForSearch = queryRaw.replace(/^['"]/, "");

  return { atStart, tokenEnd, queryRaw, queryForSearch };
}

function formatAtFileToken(file: string): string {
  const needsQuotes = /\s/.test(file);
  return `@${needsQuotes ? `"${file}"` : file}`;
}

function getTextOffsetLeftPx(textarea: HTMLTextAreaElement, charIndex: number): number {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");

  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "0";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflowWrap = "break-word";
  mirror.style.boxSizing = "border-box";

  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.fontStyle = style.fontStyle;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;

  mirror.style.paddingTop = style.paddingTop;
  mirror.style.paddingRight = style.paddingRight;
  mirror.style.paddingBottom = style.paddingBottom;
  mirror.style.paddingLeft = style.paddingLeft;

  mirror.style.width = `${textarea.clientWidth}px`;

  const text = textarea.value.slice(0, Math.max(0, Math.min(charIndex, textarea.value.length)));
  mirror.textContent = text;

  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  document.body.removeChild(mirror);

  return markerRect.left - mirrorRect.left - textarea.scrollLeft;
}

export const HybridInputBar = forwardRef<HybridInputBarHandle, HybridInputBarProps>(
  ({ onSend, cwd, disabled = false, className }, ref) => {
    const [value, setValue] = useState("");
    const [isComposing, setIsComposing] = useState(false);
    const allowNextLineBreakRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const inputShellRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [atContext, setAtContext] = useState<AtFileContext | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const lastQueryRef = useRef<string>("");
    const [menuLeftPx, setMenuLeftPx] = useState<number>(0);

    const canSend = useMemo(() => value.trim().length > 0 && !disabled, [disabled, value]);

    const isAutocompleteOpen = !!atContext && !disabled;

    const { files: autocompleteFiles, isLoading: isAutocompleteLoading } = useFileAutocomplete({
      cwd,
      query: atContext?.queryForSearch ?? "",
      enabled: isAutocompleteOpen,
      limit: 50,
    });

    const resizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
      if (!textarea) return;
      textarea.style.height = "auto";
      const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
      textarea.style.height = `${nextHeight}px`;
    }, []);

    useLayoutEffect(() => {
      if (!isAutocompleteOpen) return;
      const textarea = textareaRef.current;
      const shell = inputShellRef.current;
      if (!textarea || !shell || !atContext) return;

      const compute = () => {
        const shellRect = shell.getBoundingClientRect();
        const textareaRect = textarea.getBoundingClientRect();
        const textareaOffsetLeft = textareaRect.left - shellRect.left;
        const markerLeft = getTextOffsetLeftPx(textarea, atContext.atStart);

        const rawLeft = textareaOffsetLeft + markerLeft;
        const menuWidth = menuRef.current?.offsetWidth ?? 420;
        const maxLeft = Math.max(0, shell.clientWidth - menuWidth);
        const clampedLeft = Math.max(0, Math.min(rawLeft, maxLeft));
        setMenuLeftPx(clampedLeft);
      };

      compute();

      const onResize = () => compute();
      window.addEventListener("resize", onResize);
      const ro = new ResizeObserver(() => compute());
      ro.observe(shell);
      ro.observe(textarea);

      return () => {
        window.removeEventListener("resize", onResize);
        ro.disconnect();
      };
    }, [atContext, isAutocompleteOpen]);

    useEffect(() => {
      const query = atContext?.queryForSearch ?? "";
      if (query !== lastQueryRef.current) {
        lastQueryRef.current = query;
        setSelectedIndex(0);
      }
    }, [atContext?.queryForSearch]);

    useEffect(() => {
      if (!isAutocompleteOpen) return;
      const root = rootRef.current;
      if (!root) return;

      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (root.contains(target)) return;
        setAtContext(null);
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [isAutocompleteOpen]);

    useEffect(() => {
      if (!isAutocompleteOpen) return;
      if (autocompleteFiles.length === 0) {
        setSelectedIndex(0);
        return;
      }
      setSelectedIndex((prev) => Math.max(0, Math.min(prev, autocompleteFiles.length - 1)));
    }, [autocompleteFiles.length, isAutocompleteOpen]);

    const send = useCallback(() => {
      if (!canSend) return;
      const payload = buildTerminalSendPayload(value);
      // Pass raw 'value' as 'text' so the backend handles formatting/bracketing cleanly
      onSend({ data: payload.data, trackerData: payload.trackerData, text: value });
      setValue("");
      setAtContext(null);
      requestAnimationFrame(() => resizeTextarea(textareaRef.current));
    }, [canSend, onSend, value, resizeTextarea]);

    const focusTextarea = useCallback(() => {
      if (disabled) return;
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      requestAnimationFrame(() => textarea.focus());
    }, [disabled]);

    useImperativeHandle(ref, () => ({ focus: focusTextarea }), [focusTextarea]);

    const refreshAtContextFromTextarea = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const next = getAtFileContext(textarea.value, textarea.selectionStart ?? textarea.value.length);
      setAtContext(next);
    }, []);

    const insertSelectedFile = useCallback(
      (file: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const caret = textarea.selectionStart ?? value.length;
        const ctx = getAtFileContext(value, caret);
        if (!ctx) return;

        const token = `${formatAtFileToken(file)} `;
        const before = value.slice(0, ctx.atStart);
        const after = value.slice(ctx.tokenEnd);
        const nextValue = `${before}${token}${after}`;
        const nextCaret = before.length + token.length;

        setValue(nextValue);
        setAtContext(null);
        setSelectedIndex(0);

        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(nextCaret, nextCaret);
          resizeTextarea(textarea);
        });
      },
      [resizeTextarea, value]
    );

    return (
      <div
        ref={rootRef}
        className={cn(
          "shrink-0 cursor-text border-t border-white/5 bg-[var(--color-surface)] px-2 pb-1.5 pt-2",
          className
        )}
        onPointerDownCapture={(e) => {
          if (disabled) return;
          if (e.button !== 0) return;
          focusTextarea();
        }}
        onMouseDownCapture={(e) => {
          if (e.button !== 0) return;
          focusTextarea();
        }}
        onClick={() => {
          focusTextarea();
        }}
      >
        <div className="flex items-end gap-2">
          <div
            ref={inputShellRef}
            className={cn(
              "relative",
              "flex w-full items-start gap-1.5 rounded-sm border border-white/5 bg-white/[0.03] transition-colors",
              "focus-within:border-canopy-accent/30 focus-within:bg-white/[0.05]",
              disabled && "opacity-60"
            )}
            aria-disabled={disabled}
          >
            <FileAutocompleteMenu
              ref={menuRef}
              isOpen={isAutocompleteOpen}
              files={autocompleteFiles}
              selectedIndex={selectedIndex}
              isLoading={isAutocompleteLoading}
              onSelect={insertSelectedFile}
              style={{ left: `${menuLeftPx}px` }}
            />

            <div className="select-none pl-2 pr-1 pt-1 font-mono text-xs font-semibold leading-5 text-canopy-accent/85">
              ❯
            </div>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                resizeTextarea(e.target);
                setAtContext(getAtFileContext(e.target.value, e.target.selectionStart));
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="Command…"
              rows={1}
              spellCheck={false}
              className={cn(
                "min-h-[28px] flex-1 resize-none bg-transparent py-1 pr-2 font-mono text-xs leading-5 text-canopy-text",
                "placeholder:text-canopy-text/25 focus:outline-none disabled:opacity-50",
                "max-h-40 overflow-y-auto"
              )}
              disabled={disabled}
              onBlurCapture={(e) => {
                const nextTarget = e.relatedTarget as HTMLElement | null;
                const root = rootRef.current;
                if (root && nextTarget && root.contains(nextTarget)) return;
                setAtContext(null);
              }}
              onBeforeInput={(e) => {
                if (disabled) return;
                if (isComposing) return;
                const nativeEvent = e.nativeEvent as InputEvent;
                if (nativeEvent.isComposing) return;
                if (
                  nativeEvent.inputType !== "insertLineBreak" &&
                  nativeEvent.inputType !== "insertParagraph"
                ) {
                  return;
                }

                if (isAutocompleteOpen && autocompleteFiles[selectedIndex]) {
                  e.preventDefault();
                  e.stopPropagation();
                  insertSelectedFile(autocompleteFiles[selectedIndex]);
                  return;
                }

                if (allowNextLineBreakRef.current) {
                  allowNextLineBreakRef.current = false;
                  return;
                }

                e.preventDefault();
                e.stopPropagation();
                send();
              }}
              onKeyDownCapture={(e) => {
                if (disabled) return;
                if (isComposing || e.nativeEvent.isComposing) return;

                if (isAutocompleteOpen) {
                  const resultsCount = autocompleteFiles.length;
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setAtContext(null);
                    return;
                  }

                  if (resultsCount > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedIndex((prev) => {
                      if (resultsCount === 0) return 0;
                      if (e.key === "ArrowDown") return (prev + 1) % resultsCount;
                      return (prev - 1 + resultsCount) % resultsCount;
                    });
                    return;
                  }

                  if (resultsCount > 0 && (e.key === "Enter" || e.key === "Tab")) {
                    e.preventDefault();
                    e.stopPropagation();
                    insertSelectedFile(autocompleteFiles[selectedIndex]);
                    return;
                  }
                }

                const isEnter =
                  e.key === "Enter" ||
                  e.key === "Return" ||
                  e.code === "Enter" ||
                  e.code === "NumpadEnter";
                if (isEnter && e.shiftKey) {
                  allowNextLineBreakRef.current = true;
                  return;
                }
                allowNextLineBreakRef.current = false;
                if (isEnter) {
                  e.preventDefault();
                  e.stopPropagation();
                  send();
                }
              }}
              onKeyUpCapture={() => {
                if (disabled) return;
                refreshAtContextFromTextarea();
              }}
              onClick={() => {
                if (disabled) return;
                refreshAtContextFromTextarea();
              }}
            />
          </div>
        </div>

        <div className="mt-1 flex items-center justify-end px-[2px]">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={send}
            disabled={!canSend}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-mono font-medium transition-colors",
              "border-white/10 bg-white/[0.02] text-canopy-text/60 hover:border-white/20 hover:bg-white/[0.05] hover:text-canopy-text",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-canopy-accent/35",
              "cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/[0.02] disabled:hover:text-canopy-text/60"
            )}
            aria-label="Send (Enter)"
            title="Send (Enter)"
          >
            <span className="text-[12px] leading-none text-canopy-text/70" aria-hidden="true">
              ↵
            </span>
            <span>Send</span>
          </button>
        </div>
      </div>
    );
  }
);

HybridInputBar.displayName = "HybridInputBar";
