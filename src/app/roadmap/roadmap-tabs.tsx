"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Megaphone, Building2, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

// スマホ用：ロードマップの下部タブ（PCはサイドバーから行く）
const TABS = [
  { href: "/roadmap", label: "ホーム", icon: House },
  { href: "/roadmap/board", label: "掲示板", icon: Megaphone },
  { href: "/roadmap/biz-goals", label: "事業目標", icon: Building2 },
  { href: "/roadmap/my-goals", label: "私の目標", icon: Flag },
];

export function RoadmapTabs() {
  const pathname = usePathname();
  return (
    <>
      {/* タブの高さぶん、本文の下に余白をあける */}
      <div className="h-16 md:hidden" />
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => {
          const active = t.href === "/roadmap" ? pathname === "/roadmap" : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-blue-600" : "text-gray-500")}
            >
              <Icon className="size-5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
