"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "对标账号", href: "/clerk" },
  { label: "SOP 库", href: "/sops" },
];

export function ClerkTabs() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/clerk" ? pathname === "/clerk" : pathname.startsWith(href);

  return (
    <nav className="flex items-center gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
            isActive(tab.href)
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
