"use client";

import { Check, CircleHelp, Copy, Crosshair, LifeBuoy, RotateCcw, SendHorizontal, TriangleAlert, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ConfirmClear } from "./ConfirmClear";
import { StudioExplorer } from "@/components/studio/StudioExplorer";
import { buttonStyles } from "@/components/ui/button-styles";
import { getEquipmentById } from "@/lib/content/equipment";
import { cn } from "@/lib/cn";
import { buildSupportSummary, describeStep } from "@/lib/troubleshooter/engine";
import { useTroubleshooter } from "@/lib/troubleshooter/TroubleshooterProvider";
import type { ChatMessage, StepOption } from "@/lib/troubleshooter/types";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";

const EMBED_QUERY = "(min-width: 1280px)";

const universalIcons: Record<string, typeof CircleHelp> = {
  "u-unsure": CircleHelp,
  "u-show": Crosshair,
  "u-support": LifeBuoy,
};

export function Troubleshooter() {
  const { conversation, send, endSession, restored, dismissRestored } = useTroubleshooter();
  const { state: workspace, run, setEmbeddedExplorerVisible } = useWorkspace();
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const focusOptionsNext = useRef(false);
  const [showEmbedded, setShowEmbedded] = useState(false);

  const step = describeStep(conversation);
  const selected = getEquipmentById(workspace.selectedEquipmentId);
  const answerOptions = step.options.filter((o) => o.kind === "answer" || o.kind === "topic");
  const universalOptions = step.options.filter((o) => o.kind === "universal");
  const navOptions = step.options.filter((o) => o.kind === "restart" || o.kind === "back");
  const showSummary = step.kind === "support" || step.kind === "outcome";

  // Show the studio beside the chat on wide screens; otherwise "Show me where" navigates.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(EMBED_QUERY);
    const sync = () => {
      setShowEmbedded(media.matches);
      setEmbeddedExplorerVisible(media.matches);
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      setEmbeddedExplorerVisible(false);
    };
  }, [setEmbeddedExplorerVisible]);

  // Keep the newest message in view and move keyboard focus to the new options.
  useEffect(() => {
    const log = logRef.current;
    if (log && log.scrollHeight > log.clientHeight + 1) {
      // Wide layout: the log scrolls internally.
      log.scrollTop = log.scrollHeight;
    } else if (log && conversation.messages.length > 1) {
      // Phones/tablets: the page scrolls. Bring the newest message into view below the header.
      const last = log.querySelector("li:last-child");
      const top = last ? last.getBoundingClientRect().top : 0;
      if (last && (top < 72 || top > window.innerHeight - 240)) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo?.({ top: window.scrollY + top - 80, behavior: reduce ? "auto" : "smooth" });
      }
    }
    if (focusOptionsNext.current) {
      focusOptionsNext.current = false;
      optionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }
  }, [conversation.messages.length]);

  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const hasContent = conversation.messages.some((m) => m.role === "user");

  const requestClear = () => {
    if (!hasContent) return;
    setConfirmingClear(true);
  };
  const cancelClear = () => {
    setConfirmingClear(false);
    clearButtonRef.current?.focus();
  };
  const confirmClear = () => {
    setConfirmingClear(false);
    endSession();
  };

  const choose = (option: StepOption) => {
    if (option.kind === "restart") {
      requestClear();
      return;
    }
    focusOptionsNext.current = true;
    send({ type: "option", optionId: option.id });
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft.trim()) {
      setInputError("Type a short description of the problem first.");
      return;
    }
    setInputError(null);
    send({ type: "text", text: draft });
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section
        aria-label="Troubleshooting conversation"
        // Phones/tablets: the conversation flows with the page so it gets the whole screen.
        className="flex flex-col overflow-clip rounded-xl border border-ink-750 bg-ink-900 xl:h-[calc(100dvh-11rem)]"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-750 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="rounded border border-caution-400/30 bg-caution-900/40 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-caution-300 uppercase">
              Prototype
            </span>
            <p className="text-sm text-ink-300">
              Scripted <span className="max-sm:hidden">responses </span>— not a live AI
            </p>
          </div>
          <button
            ref={clearButtonRef}
            type="button"
            onClick={requestClear}
            disabled={!hasContent}
            aria-expanded={confirmingClear}
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            End session
          </button>
        </header>

        {confirmingClear && <ConfirmClear onConfirm={confirmClear} onCancel={cancelClear} />}

        {/* Urgency stays visible whatever step the conversation is on. */}
        {conversation.urgent ? (
          <div role="status" data-testid="urgent-banner" className="flex gap-2.5 border-b border-alert-400/40 bg-alert-900/50 px-4 py-2.5 text-[13px] sm:px-5">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-alert-300" />
            <p className="text-ink-50">
              <span className="font-semibold text-alert-300">Urgent: silence on air reported.</span> Contact technical support now.
              Their contact details haven&apos;t been configured in Radio Technics yet.
            </p>
          </div>
        ) : conversation.possibleSilence ? (
          <div role="status" data-testid="possible-silence-banner" className="flex gap-2.5 border-b border-caution-400/30 bg-caution-900/40 px-4 py-2.5 text-[13px] sm:px-5">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-caution-400" />
            <p className="text-ink-100">
              <span className="font-semibold text-caution-300">Possible silence reported.</span> If the station is silent on air, say so
              — it will be treated as urgent.
            </p>
          </div>
        ) : null}

        {restored && !confirmingClear && (
          <div role="status" className="flex items-start justify-between gap-3 border-b border-ink-750 bg-ink-850/60 px-4 py-2.5 text-[13px] sm:px-5">
            <p className="text-ink-200">
              Your conversation from earlier in this browser tab has been restored. It is cleared when the tab is closed, after two hours
              without use, or when you choose <span className="font-medium text-ink-50">End session</span>.
            </p>
            <button
              type="button"
              onClick={dismissRestored}
              aria-label="Dismiss restored conversation message"
              className="flex size-7 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        )}

        {selected && (
          <div className="flex items-center justify-between gap-3 border-b border-ink-750 bg-ink-850/60 px-4 py-2 text-[13px] sm:px-5">
            <p className="min-w-0 text-ink-300">
              Selected in Studio Explorer: <span className="font-medium text-ink-100">{selected.name}</span>
            </p>
            <button
              type="button"
              onClick={() => run([{ type: "clear_selection" }])}
              aria-label="Clear selected equipment"
              className="flex size-7 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        )}

        {/* role="log" sits on a wrapper so the list keeps valid list semantics; it is focusable so keyboard users can scroll it. */}
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          tabIndex={0}
          className="px-4 py-5 focus-visible:outline-offset-[-2px] sm:px-5 xl:flex-1 xl:overflow-y-auto xl:scroll-smooth"
        >
          <ol className="flex flex-col gap-3">
            {conversation.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ol>
        </div>

        <div className="border-t border-ink-750 bg-ink-900 px-4 pt-3 pb-3 sm:px-5">
          {showSummary && <SupportSummary text={buildSupportSummary(conversation)} />}

          <div ref={optionsRef} className="flex flex-col gap-2.5" role="group" aria-label="Responses">
            {answerOptions.length > 0 && (
              <div
                className={cn(
                  "grid gap-2 xl:max-h-[38dvh] xl:overflow-y-auto",
                  (step.kind === "start" || answerOptions.length > 4) && "sm:grid-cols-2",
                )}
              >
                {answerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => choose(option)}
                    className="rounded-lg border border-ink-600 bg-ink-800 px-3.5 py-2.5 text-left text-[15px] font-medium text-ink-50 transition-colors hover:border-signal-500/60 hover:bg-ink-750"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {(universalOptions.length > 0 || navOptions.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {universalOptions.map((option) => {
                  const Icon = universalIcons[option.id] ?? CircleHelp;
                  return (
                    <button key={option.id} type="button" onClick={() => choose(option)} className={buttonStyles({ size: "sm" })}>
                      <Icon aria-hidden className="size-3.5 text-signal-400" />
                      {option.label}
                    </button>
                  );
                })}
                {navOptions.map((option) => (
                  <button key={option.id} type="button" onClick={() => choose(option)} className={buttonStyles({ size: "sm" })}>
                    {option.kind === "back" ? <Undo2 aria-hidden className="size-3.5" /> : <RotateCcw aria-hidden className="size-3.5" />}
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

          <form
            onSubmit={submit}
            // Not sticky on phones: a pinned box would cover answer buttons (WCAG 2.4.11 / 2.5.8).
            // Focusing it brings it above the on-screen keyboard.
            className="scroll-mb-4 border-t border-ink-750 bg-ink-900 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 xl:pb-4"
          >
            <label htmlFor="troubleshooter-input" className="sr-only">
              Describe the problem
            </label>
            <div className="flex items-end gap-2 rounded-lg border border-ink-600 bg-ink-850 p-1.5 focus-within:border-signal-500/70">
              <textarea
                id="troubleshooter-input"
                rows={1}
                value={draft}
                maxLength={500}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (inputError) setInputError(null);
                }}
                onKeyDown={onKeyDown}
                placeholder="Describe the problem…"
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? "troubleshooter-input-error" : undefined}
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-ink-50 placeholder:text-ink-400 focus:outline-none"
              />
              <button type="submit" aria-label="Send" className={buttonStyles({ variant: "primary", size: "sm", className: "size-9 px-0" })}>
                <SendHorizontal aria-hidden className="size-4" />
              </button>
            </div>
            {inputError && (
              <p id="troubleshooter-input-error" role="alert" className="mt-1.5 text-[13px] text-alert-300">
                {inputError}
              </p>
            )}
          </form>
      </section>

      {showEmbedded && (
        <section aria-label="Studio workspace" className="flex min-h-0 flex-col gap-2 xl:h-[calc(100dvh-11rem)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink-100">Studio workspace</h2>
            <p className="text-xs text-ink-400">The troubleshooter highlights equipment here</p>
          </div>
          <StudioExplorer variant="embedded" />
        </section>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "notice") {
    return (
      <li className="animate-fade-up self-center rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-center text-[13px] text-ink-300">
        {message.text}
      </li>
    );
  }
  const assistant = message.role === "assistant";
  return (
    <li className={cn("animate-fade-up flex max-w-[92%] flex-col gap-1", assistant ? "self-start" : "self-end items-end")}>
      <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-ink-400 uppercase">
        {assistant ? "Troubleshooter (prototype)" : "You"}
      </span>
      <div
        role={message.urgent ? "alert" : undefined}
        className={cn(
          "rounded-xl px-3.5 py-2.5 text-[15px] leading-relaxed",
          assistant ? "rounded-tl-sm border border-ink-700 bg-ink-850 text-ink-50" : "rounded-tr-sm bg-signal-900 text-signal-300",
          message.urgent && "border-alert-400/50 bg-alert-900/50",
        )}
      >
        {message.urgent && (
          <span className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-alert-300">
            <TriangleAlert aria-hidden className="size-3.5" /> Urgent
          </span>
        )}
        <p>{message.text}</p>
        {message.help && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">{message.help}</p>}
      </div>
    </li>
  );
}

function SupportSummary({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };
  return (
    <div className="mb-3 rounded-lg border border-ink-700 bg-ink-850">
      <div className="flex items-center justify-between gap-2 border-b border-ink-750 px-3 py-2">
        <h3 className="text-[13px] font-semibold text-ink-100">Summary for technical support</h3>
        <button type="button" onClick={copy} className={buttonStyles({ variant: "ghost", size: "sm", className: "h-7" })}>
          {status === "copied" ? <Check aria-hidden className="size-3.5 text-signal-400" /> : <Copy aria-hidden className="size-3.5" />}
          {status === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0} aria-label="Summary text" className="max-h-36 overflow-y-auto px-3 py-2 focus-visible:outline-offset-[-2px] font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-200">{text}</pre>
      {status === "failed" && (
        <p role="alert" className="px-3 pb-2 text-[13px] text-alert-300">
          Couldn&apos;t copy automatically. Select the text above and copy it instead.
        </p>
      )}
    </div>
  );
}
