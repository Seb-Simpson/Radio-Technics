"use client";

import { LifeBuoy, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isActivePath, navItems } from "./navigation";
import { BrandMark } from "./BrandMark";

function NavList({ pathname, onNavigate, variant }: { pathname: string; onNavigate?: () => void; variant: "sidebar" | "menu" }) {
  return (
    <ul className={cn("flex flex-col gap-1", variant === "menu" && "p-2")}>
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-md px-3 font-medium transition-colors duration-150",
                variant === "menu" ? "min-h-12 text-[15px]" : "py-2 text-sm",
                active ? "bg-ink-800 text-ink-50" : "text-ink-300 hover:bg-ink-850 hover:text-ink-100",
              )}
            >
              <span
                aria-hidden
                className={cn("absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-signal-400 transition-opacity", active ? "opacity-100" : "opacity-0")}
              />
              <Icon aria-hidden className={cn("size-4", active ? "text-signal-400" : "text-ink-400 group-hover:text-ink-200")} />
              <span className="flex flex-col">
                {item.label}
                {variant === "menu" && <span className="text-[12px] font-normal text-ink-400">{item.description}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Move focus into the menu when it opens; close on outside press.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const closeMenu = (returnFocus: boolean) => {
    setMenuOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-signal-500 px-3 py-2 text-sm font-medium text-ink-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>

      {/* Phones and tablets: compact header with a primary "Get help" action and a menu. */}
      <header
        data-app-header
        // Sticky only on tall screens: on short screens (or high browser zoom) it would cover focused content.
        className="relative top-0 z-40 border-b border-ink-750 bg-ink-900/95 pt-[env(safe-area-inset-top)] backdrop-blur tall:sticky lg:hidden"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) closeMenu(true);
        }}
      >
        <div className="flex h-14 items-center gap-2 pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md" aria-label="Radio Technics home">
            <BrandMark />
            <span className="truncate text-[15px] font-semibold tracking-tight text-ink-50 max-[419px]:sr-only">Radio Technics</span>
          </Link>
          <span className="rounded border border-caution-400/30 bg-caution-900/40 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-caution-300 uppercase">
            Prototype
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {!isActivePath(pathname, "/troubleshooter") && (
              <Link
                href="/troubleshooter"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-signal-500 px-3 text-sm font-semibold whitespace-nowrap text-ink-950 hover:bg-signal-400"
              >
                <LifeBuoy aria-hidden className="size-4" />
                Get help
              </Link>
            )}
            <button
              ref={menuButtonRef}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex size-11 items-center justify-center rounded-lg text-ink-100 hover:bg-ink-800"
            >
              {menuOpen ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
              <span className="sr-only">Menu</span>
            </button>
          </div>
        </div>
        {/* Always rendered so aria-controls resolves; `hidden` removes it from view and the accessibility tree. */}
        <div ref={menuRef} id="mobile-menu" hidden={!menuOpen} className="animate-fade-up border-t border-ink-750 bg-ink-900 shadow-xl shadow-black/40">
            <nav aria-label="Main">
              <NavList pathname={pathname} variant="menu" onNavigate={() => setMenuOpen(false)} />
            </nav>
            <p className="border-t border-ink-750 px-5 py-3 text-xs leading-relaxed text-ink-400">
              Prototype · demonstration data only. Not connected to any studio equipment.
            </p>
        </div>
      </header>

      {/* Large screens: persistent sidebar. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-ink-750 bg-ink-900/95 lg:block">
        <div className="flex items-center px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight text-ink-50">Radio Technics</span>
          </Link>
        </div>
        <nav aria-label="Main" className="px-3">
          <NavList pathname={pathname} variant="sidebar" />
        </nav>
        <div className="absolute right-0 bottom-0 left-0 border-t border-ink-750 px-5 py-4">
          <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-caution-300 uppercase">Prototype · RT-002</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-400">Demonstration data only. Not connected to any studio equipment.</p>
        </div>
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-[env(safe-area-inset-bottom)] focus:outline-none">
        {children}
      </main>
    </div>
  );
}
