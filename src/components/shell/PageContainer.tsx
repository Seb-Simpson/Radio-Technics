import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageContainer({ children, wide = false, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8", wide ? "max-w-[1600px]" : "max-w-6xl", className)}>
      {children}
    </div>
  );
}
