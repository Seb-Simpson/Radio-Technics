"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isActivePath, navItems } from "./navigation";
import { BrandMark } from "./BrandMark";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const navRef = useRef<HTMLUListElement>(null);

  // On narrow screens the nav scrolls sideways: keep the current section visible.
  // Scroll the list itself — element.scrollIntoView() would move the browser's
  // sequential focus starting point and make Tab skip the skip link.
  useEffect(() => {
    const list = navRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const item = active.parentElement ?? active;
    if (item.offsetLeft < list.scrollLeft || item.offsetLeft + item.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = Math.max(0, item.offsetLeft - 12);
    }
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-signal-500 px-3 py-2 text-sm font-medium text-ink-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>

      {/* Sidebar (large screens) / top bar (smaller screens) */}
      <aside className="sticky top-0 z-30 border-b border-ink-750 bg-ink-900/95 backdrop-blur lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight text-ink-50">Radio Technics</span>
          </Link>
          <span className="rounded border border-caution-400/30 bg-caution-900/40 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-caution-300 uppercase lg:hidden">
            Prototype
          </span>
        </div>

        <nav aria-label="Main" className="lg:px-3">
          <ul ref={navRef} className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                      active ? "bg-ink-800 text-ink-50" : "text-ink-300 hover:bg-ink-850 hover:text-ink-100",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-2 bottom-2 left-0 hidden w-0.5 rounded-full bg-signal-400 transition-opacity lg:block",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon aria-hidden className={cn("size-4", active ? "text-signal-400" : "text-ink-400 group-hover:text-ink-200")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="absolute right-0 bottom-0 left-0 hidden border-t border-ink-750 px-5 py-4 lg:block">
          <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-caution-300 uppercase">Prototype · RT-001</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
            Demonstration data only. Not connected to any studio equipment.
          </p>
        </div>
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        {children}
      </main>
    </div>
  );
}
