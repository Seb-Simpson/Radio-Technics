"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { buttonStyles } from "@/components/ui/button-styles";

/**
 * Inline confirmation shown before a conversation is cleared.
 * Clearing is only ever triggered from here — never from typed text.
 */
export function ConfirmClear({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="confirm-clear-title"
      aria-describedby="confirm-clear-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
      className="animate-fade-up border-b border-caution-400/30 bg-caution-900/40 px-4 py-3 sm:px-5"
    >
      <div className="flex gap-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-caution-400" />
        <div className="min-w-0 flex-1">
          <p id="confirm-clear-title" className="text-sm font-semibold text-ink-50">
            Clear this conversation?
          </p>
          <p id="confirm-clear-description" className="mt-0.5 text-[13px] leading-relaxed text-ink-200">
            Your answers, what you typed and the support summary will be removed. This can&apos;t be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button ref={keepRef} type="button" onClick={onCancel} className={buttonStyles({ size: "sm" })}>
              Keep conversation
            </button>
            <button type="button" onClick={onConfirm} className={buttonStyles({ variant: "ghost", size: "sm", className: "text-caution-300 hover:text-caution-300" })}>
              Clear conversation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
