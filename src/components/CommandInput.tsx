"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface CommandInputProps {
  onSubmit: (input: string) => void;
  disabled: boolean;
}

export default function CommandInput({ onSubmit, disabled }: CommandInputProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    setHistory((prev) => [trimmed, ...prev]);
    setHistoryIndex(-1);
    onSubmit(trimmed);
    setValue("");
  }, [value, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length > 0) {
          const newIndex = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(newIndex);
          setValue(history[newIndex]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setValue(history[newIndex]);
        } else {
          setHistoryIndex(-1);
          setValue("");
        }
      }
    },
    [handleSubmit, history, historyIndex]
  );

  return (
    <div className="border-t border-terminal-border bg-terminal-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-terminal-green font-bold select-none">
          DR &gt;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled ? "Processing..." : "Type a command (ask patient, order labs, examine...)"
          }
          className="flex-1 bg-transparent outline-none text-foreground text-sm placeholder:text-terminal-dim caret-terminal-green"
          autoComplete="off"
          spellCheck={false}
        />
        {disabled && (
          <span className="text-terminal-dim text-xs">
            <span className="cursor-blink">|</span> Processing...
          </span>
        )}
      </div>
    </div>
  );
}
