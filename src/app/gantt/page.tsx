"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStageLabel, getStageColor } from "@/lib/stages";
import { getTaskStatusColor, getTaskStatusLabel } from "@/lib/task-status";
import Link from "next/link";
import { ChevronDown, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface Deal {
  id: string;
  title: string;
  stage: string;
  amount: number | null;
  expectedCloseDate: string | null;
  createdAt: string;
  contact: { id: string; name: string; company: string | null };
}

interface Task {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  dealId: string | null;
  forStage: string | null;
}

interface Member {
  id: string;
  name: string;
  color: string;
}

type ViewScale = "week" | "month";

export default function GanttPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState<ViewScale>("week");

  const loadData = useCallback(async () => {
    const [dealsRes, tasksRes, membersRes] = await Promise.all([
      fetch("/api/deals"),
      fetch("/api/tasks"),
      fetch("/api/members"),
    ]);
    setDeals(await dealsRes.json());
    setTasks(await tasksRes.json());
    setMembers(await membersRes.json());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleExpand(dealId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(deals.map((d) => d.id)));
  }

  // Calculate date range
  const { startDate, endDate, totalDays, columns } = useMemo(() => {
    const allDates: Date[] = [];
    const now = new Date();
    allDates.push(now);

    deals.forEach((d) => {
      allDates.push(new Date(d.createdAt));
      if (d.expectedCloseDate) allDates.push(new Date(d.expectedCloseDate));
    });
    tasks.forEach((t) => {
      allDates.push(new Date(t.createdAt));
      if (t.dueDate) allDates.push(new Date(t.dueDate));
    });

    let minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
    let maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));

    // Add padding
    minDate = new Date(minDate);
    minDate.setDate(minDate.getDate() - 7);
    maxDate = new Date(maxDate);
    maxDate.setDate(maxDate.getDate() + 14);

    // Snap to start of week (Monday)
    const day = minDate.getDay();
    minDate.setDate(minDate.getDate() - ((day + 6) % 7));

    const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

    // Generate columns
    const cols: { label: string; date: Date; isToday: boolean; isWeekend: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(minDate);
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.getDay();
      cols.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        date: d,
        isToday: d.toDateString() === today.toDateString(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }

    return { startDate: minDate, endDate: maxDate, totalDays, columns: cols };
  }, [deals, tasks]);

  function dayOffset(dateStr: string): number {
    const d = new Date(dateStr);
    return Math.floor((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  function getMemberColor(assignee: string | null): string {
    if (!assignee) return "#9ca3af";
    return members.find((m) => m.name === assignee)?.color || "#3b82f6";
  }

  const cellWidth = scale === "week" ? 32 : 12;

  // Group columns by month for header
  const monthHeaders = useMemo(() => {
    const headers: { label: string; span: number }[] = [];
    let currentMonth = "";
    columns.forEach((col) => {
      const month = `${col.date.getFullYear()}/${col.date.getMonth() + 1}月`;
      if (month !== currentMonth) {
        headers.push({ label: month, span: 1 });
        currentMonth = month;
      } else {
        headers[headers.length - 1].span++;
      }
    });
    return headers;
  }, [columns]);

  const activeDeals = deals.filter((d) => d.stage !== "lost");

  if (deals.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">ガントチャート</h2>
        <p className="text-gray-500">案件がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">ガントチャート</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            すべて展開
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScale(scale === "week" ? "month" : "week")}
          >
            {scale === "week" ? <ZoomOut className="size-4 mr-1" /> : <ZoomIn className="size-4 mr-1" />}
            {scale === "week" ? "縮小" : "拡大"}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-140px)]">
        <div className="flex">
          {/* Left panel - row labels */}
          <div className="sticky left-0 z-10 bg-white border-r min-w-[240px] shrink-0">
            {/* Month header placeholder */}
            <div className="h-8 border-b bg-gray-50" />
            {/* Day header placeholder */}
            <div className="h-8 border-b bg-gray-50 flex items-center px-3">
              <span className="text-xs font-medium text-gray-500">案件 / タスク</span>
            </div>

            {activeDeals.map((deal) => {
              const dealTasks = tasks.filter((t) => t.dealId === deal.id);
              const isExpanded = expanded.has(deal.id);
              return (
                <div key={deal.id}>
                  {/* Deal row */}
                  <div
                    className="h-10 border-b flex items-center px-2 gap-1 cursor-pointer hover:bg-gray-50 font-medium text-sm"
                    onClick={() => toggleExpand(deal.id)}
                  >
                    {dealTasks.length > 0 ? (
                      isExpanded ? <ChevronDown className="size-4 text-gray-400 shrink-0" /> : <ChevronRight className="size-4 text-gray-400 shrink-0" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <Link href={`/deals/${deal.id}`} className="text-blue-700 hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                      {deal.title}
                    </Link>
                    <Badge className={`ml-auto text-xs shrink-0 ${getStageColor(deal.stage)}`}>
                      {getStageLabel(deal.stage)}
                    </Badge>
                  </div>
                  {/* Task rows */}
                  {isExpanded && dealTasks.map((task) => (
                    <div key={task.id} className="h-8 border-b flex items-center pl-8 pr-2 gap-2 text-xs text-gray-600">
                      <span className="truncate flex-1">{task.title}</span>
                      {task.assignee && (
                        <span
                          className="shrink-0 w-2 h-2 rounded-full"
                          style={{ backgroundColor: getMemberColor(task.assignee) }}
                          title={task.assignee}
                        />
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Right panel - chart */}
          <div className="flex-1">
            {/* Month header */}
            <div className="h-8 border-b bg-gray-50 flex">
              {monthHeaders.map((mh, i) => (
                <div
                  key={i}
                  className="border-r text-xs font-medium text-gray-500 flex items-center justify-center"
                  style={{ width: mh.span * cellWidth }}
                >
                  {mh.label}
                </div>
              ))}
            </div>
            {/* Day header */}
            <div className="h-8 border-b bg-gray-50 flex">
              {columns.map((col, i) => (
                <div
                  key={i}
                  className={`border-r text-center text-xs flex items-center justify-center shrink-0 ${
                    col.isToday ? "bg-blue-100 font-bold text-blue-700" : col.isWeekend ? "bg-gray-100 text-gray-400" : "text-gray-500"
                  }`}
                  style={{ width: cellWidth }}
                >
                  {scale === "week" ? col.date.getDate() : ""}
                </div>
              ))}
            </div>

            {/* Rows */}
            {activeDeals.map((deal) => {
              const dealTasks = tasks.filter((t) => t.dealId === deal.id);
              const isExpanded = expanded.has(deal.id);

              // Deal bar: createdAt → expectedCloseDate (or latest task dueDate)
              const dealStart = dayOffset(deal.createdAt);
              let dealEndDate = deal.expectedCloseDate;
              if (!dealEndDate) {
                const taskDueDates = dealTasks.filter((t) => t.dueDate).map((t) => new Date(t.dueDate!).getTime());
                if (taskDueDates.length > 0) dealEndDate = new Date(Math.max(...taskDueDates)).toISOString();
              }
              const dealEnd = dealEndDate ? dayOffset(dealEndDate) : dealStart + 7;
              const dealWidth = Math.max(dealEnd - dealStart, 1);

              return (
                <div key={deal.id}>
                  {/* Deal bar */}
                  <div className="h-10 border-b relative flex items-center" style={{ width: totalDays * cellWidth }}>
                    {/* Background grid */}
                    {columns.map((col, i) => (
                      <div
                        key={i}
                        className={`absolute top-0 bottom-0 border-r ${col.isToday ? "bg-blue-50" : col.isWeekend ? "bg-gray-50" : ""}`}
                        style={{ left: i * cellWidth, width: cellWidth }}
                      />
                    ))}
                    {/* Bar */}
                    <div
                      className="absolute h-5 rounded-sm opacity-80"
                      style={{
                        left: dealStart * cellWidth,
                        width: dealWidth * cellWidth,
                        backgroundColor: "#3b82f6",
                      }}
                    />
                  </div>

                  {/* Task bars */}
                  {isExpanded && dealTasks.map((task) => {
                    const taskStart = dayOffset(task.createdAt);
                    const taskEnd = task.dueDate ? dayOffset(task.dueDate) : taskStart + 3;
                    const taskWidth = Math.max(taskEnd - taskStart, 1);
                    const isDone = task.status === "done";
                    const color = getMemberColor(task.assignee);

                    return (
                      <div key={task.id} className="h-8 border-b relative flex items-center" style={{ width: totalDays * cellWidth }}>
                        {columns.map((col, i) => (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 border-r ${col.isToday ? "bg-blue-50" : col.isWeekend ? "bg-gray-50" : ""}`}
                            style={{ left: i * cellWidth, width: cellWidth }}
                          />
                        ))}
                        <div
                          className={`absolute h-4 rounded-sm ${isDone ? "opacity-40" : "opacity-70"}`}
                          style={{
                            left: taskStart * cellWidth,
                            width: taskWidth * cellWidth,
                            backgroundColor: color,
                          }}
                        />
                        {isDone && (
                          <div
                            className="absolute h-4 rounded-sm opacity-90"
                            style={{
                              left: taskStart * cellWidth,
                              width: taskWidth * cellWidth,
                              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.4) 3px, rgba(255,255,255,0.4) 6px)`,
                              backgroundColor: color,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
