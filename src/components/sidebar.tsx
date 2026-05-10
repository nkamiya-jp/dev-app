"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Users,
  KanbanSquare,
  CheckSquare,
  FileText,
  Menu,
  Briefcase,
  UserCircle,
  GanttChart,
  Target,
  Package,
  ShoppingCart,
  Hammer,
  Truck,
  Boxes,
  Lightbulb,
  TrendingUp,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navSections = [
  {
    label: "ホーム",
    items: [
      { href: "/dashboard", label: "ダッシュボード", icon: BarChart3 },
    ],
  },
  {
    label: "営業 (DEV)",
    items: [
      { href: "/prospects", label: "開拓", icon: Target },
      { href: "/deals", label: "案件", icon: KanbanSquare },
      { href: "/development", label: "商品開発", icon: Lightbulb },
      { href: "/tasks", label: "タスク", icon: CheckSquare },
      { href: "/gantt", label: "ガントチャート", icon: GanttChart },
      { href: "/notes", label: "メモ", icon: FileText },
    ],
  },
  {
    label: "製造・出荷 (MFG)",
    items: [
      { href: "/orders", label: "受注", icon: ShoppingCart },
      { href: "/forecast", label: "需要予測", icon: TrendingUp },
      { href: "/shipping-plan", label: "出荷計画", icon: CalendarDays },
      { href: "/production", label: "製造", icon: Hammer },
      { href: "/shipments", label: "出荷", icon: Truck },
      { href: "/inventory", label: "在庫", icon: Boxes },
    ],
  },
  {
    label: "マスタ",
    items: [
      { href: "/products", label: "商品", icon: Package },
      { href: "/contacts", label: "顧客", icon: Users },
      { href: "/members", label: "スタッフ", icon: UserCircle },
    ],
  },
];

function NavContent({ pathname }: { pathname: string }) {
  return (
    <nav className="flex flex-col gap-4 px-3">
      {navSections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {section.label}
          </p>
          {section.items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarLogo() {
  return (
    <div className="flex items-center gap-3 px-6 py-5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
        <Briefcase className="size-5 text-white" />
      </div>
      <div>
        <h1 className="text-base font-bold text-white leading-tight">DEV</h1>
        <p className="text-xs text-zinc-400">別注開発管理</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-zinc-900">
        <SidebarLogo />
        <div className="flex-1 overflow-y-auto py-2">
          <NavContent pathname={pathname} />
        </div>
      </aside>

      {/* Mobile header bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b bg-zinc-900 px-4 py-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10" />
            }
          >
            <Menu className="size-5" />
            <span className="sr-only">メニューを開く</span>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-60 bg-zinc-900 p-0 border-zinc-800"
            showCloseButton={false}
          >
            <SheetTitle className="sr-only">ナビゲーション</SheetTitle>
            <SidebarLogo />
            <div className="py-2" onClick={() => setOpen(false)}>
              <NavContent pathname={pathname} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <Briefcase className="size-5 text-white" />
          <span className="text-sm font-bold text-white">DEV</span>
        </div>
      </div>
    </>
  );
}
