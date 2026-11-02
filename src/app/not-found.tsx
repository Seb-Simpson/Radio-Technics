import Link from "next/link";
import { PageContainer } from "@/components/shell/PageContainer";
import { buttonStyles } from "@/components/ui/button-styles";

export default function NotFound() {
  return (
    <PageContainer>
      <div className="flex flex-col items-start gap-3 py-16">
        <p className="font-mono text-[11px] tracking-[0.14em] text-signal-400 uppercase">Page not found</p>
        <h1 className="text-2xl font-semibold text-ink-50">We couldn&apos;t find that page</h1>
        <p className="max-w-lg text-ink-300">The link may be out of date. Use the navigation, or go back to the dashboard.</p>
        <Link href="/" className={buttonStyles({ variant: "primary", className: "mt-2" })}>
          Go to dashboard
        </Link>
      </div>
    </PageContainer>
  );
}
