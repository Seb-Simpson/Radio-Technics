import { BookOpen, LayoutDashboard, MessageSquare, Settings2, type LucideIcon, Map as MapIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, description: "Start here" },
  { href: "/studio", label: "Studio Explorer", icon: MapIcon, description: "Explore the studio equipment" },
  { href: "/troubleshooter", label: "Troubleshooter", icon: MessageSquare, description: "Work through a problem" },
  { href: "/knowledge", label: "Knowledge Centre", icon: BookOpen, description: "Guides and help topics" },
  { href: "/admin", label: "Administration", icon: Settings2, description: "Content records (read-only)" },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
