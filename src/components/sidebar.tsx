"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  BarChart3,
  Users,
  KanbanSquare,
  CheckSquare,
  FileText,
  Menu,
  UserCircle,
  GanttChart,
  Target,
  Package,
  ShoppingCart,
  Store,
  Hammer,
  Truck,
  Boxes,
  Lightbulb,
  TrendingUp,
  CalendarDays,
  Layers,
  ListChecks,
  Barcode,
  Flag,
  Crown,
  Calculator,
  ChevronDown,
  Coins,
  ClipboardList,
  Tags,
  Activity,
  House,
  Megaphone,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { HubLogo } from "@/components/hub-logo";
import { cn } from "@/lib/utils";

// need: そのメニューを出す条件（サーバー側でも同じ判定で止めている）
type Need = "president" | "sales";
interface NavItem { href: string; label: string; icon: typeof BarChart3; need?: Need }

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "ホーム",
    items: [
      { href: "/dashboard", label: "ダッシュボード", icon: BarChart3 },
    ],
  },
  {
    // 社内ポータル（目標・評価）。個人目標は本人と社長だけが見られる
    label: "ロードマップ",
    items: [
      { href: "/roadmap", label: "ホーム", icon: House },
      { href: "/roadmap/board", label: "掲示板・カレンダー", icon: Megaphone },
      { href: "/roadmap/biz-goals", label: "事業目標", icon: Building2 },
      { href: "/roadmap/my-goals", label: "私の目標", icon: Flag },
      { href: "/roadmap/president", label: "社長ページ", icon: Crown, need: "president" },
    ],
  },
  {
    label: "営業 (DEV)",
    items: [
      { href: "/prospects", label: "開拓", icon: Target },
      { href: "/deals", label: "案件", icon: KanbanSquare },
    ],
  },
  {
    // 展示会・新商品・改善活動など、営業に限らない全社横断の業務管理
    label: "プロジェクト",
    items: [
      { href: "/development", label: "プロジェクト", icon: Lightbulb },
      { href: "/tasks", label: "タスク", icon: CheckSquare },
      { href: "/gantt", label: "ガントチャート", icon: GanttChart },
      { href: "/notes", label: "メモ", icon: FileText },
    ],
  },
  {
    label: "受注・出荷",
    items: [
      { href: "/orders/board", label: "受注進捗", icon: Activity },
      { href: "/orders", label: "受注", icon: ShoppingCart },
      { href: "/orders/daily", label: "毎日伺い", icon: Store },
      { href: "/orders-by-product", label: "商品別出荷管理", icon: ClipboardList },
      { href: "/shipping-plan", label: "出荷計画", icon: CalendarDays },
      { href: "/shipments", label: "出荷", icon: Truck },
      { href: "/labels", label: "ラベル印刷", icon: Tags },
      { href: "/sales", label: "月次売上", icon: Coins, need: "sales" },
    ],
  },
  {
    label: "製造 (MFG)",
    items: [
      { href: "/production", label: "製造", icon: Hammer },
      { href: "/forecast", label: "需要予測", icon: TrendingUp },
      { href: "/monthly-plan", label: "月の収支計画", icon: Calculator, need: "sales" },
      { href: "/inventory", label: "在庫", icon: Boxes },
    ],
  },
  {
    label: "マスタ",
    items: [
      { href: "/products", label: "商品", icon: Package },
      { href: "/price-list", label: "価格表", icon: ListChecks },
      { href: "/jan", label: "JAN台帳", icon: Barcode },
      { href: "/materials", label: "資材", icon: Layers },
      { href: "/contacts", label: "顧客", icon: Users },
      { href: "/members", label: "スタッフ", icon: UserCircle },
    ],
  },
];

const COLLAPSE_KEY = "sidebar-collapsed-sections";

function NavContent({ pathname }: { pathname: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [can, setCan] = useState<Record<Need, boolean>>({ president: false, sales: false });

  useEffect(() => {
    fetch("/api/roadmap/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => me && setCan({ president: !!me.can?.president, sales: !!me.can?.sales }));
  }, []);
  const visible = (i: NavItem) => !i.need || can[i.need];

  // localStorage から復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  function toggle(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  // 現在地は「最も具体的に一致するメニュー」1つだけ（/orders/board で /orders まで光らないように）
  const activeHref = navSections
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex flex-col gap-3 px-3">
      {navSections.map((section) => {
        const isCollapsed = collapsed.has(section.label);
        // 折りたたみ中でも、現在ページを含むセクションは中身を表示（迷子防止）
        const hasActive = section.items.some((i) => i.href === activeHref);
        const showItems = !isCollapsed || hasActive;
        return (
          <div key={section.label} className="flex flex-col gap-1">
            <button
              onClick={() => toggle(section.label)}
              className="flex items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            >
              <span>{section.label}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  isCollapsed && "-rotate-90"
                )}
              />
            </button>
            {showItems && section.items.filter(visible).map((item) => {
              const isActive = item.href === activeHref;
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
        );
      })}
    </nav>
  );
}

function SidebarLogo() {
  return (
    <div className="px-6 py-5">
      <Link href="/dashboard" aria-label="HUB ホーム">
        <HubLogo />
      </Link>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="print:hidden hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-zinc-900">
        <SidebarLogo />
        <div className="flex-1 overflow-y-auto py-2">
          <NavContent pathname={pathname} />
        </div>
      </aside>

      {/* Mobile header bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b bg-zinc-900 px-4 py-3 md:hidden print:hidden">
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
            {/* メニューが長いのでこの中だけスクロール。閉じるのはメニュー（リンク）を押したときだけ（セクションの折りたたみでは閉じない） */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setOpen(false);
              }}
            >
              <NavContent pathname={pathname} />
            </div>
          </SheetContent>
        </Sheet>
        <HubLogo size="sm" />
      </div>
    </>
  );
}
