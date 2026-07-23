"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDevelopmentStatusLabel, getDevelopmentStatusColor } from "@/lib/development-status";
import Link from "next/link";
import { ChevronDown, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface Milestone {
  id: string;
  title: string;
  date: string;
  done: boolean;
}

interface Project {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  releasedDate: string | null;
  createdAt: string;
  milestones: Milestone[];
}

interface Task {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  developmentId: string | null;
}

interface Member {
  id: string;
  name: string;
  color: string;
}

type ViewScale = "week" | "month";

export default function GanttPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState<ViewScale>("week");

  const loadData = useCallback(async () => {
    const [projRes, tasksRes, membersRes] = await Promise.all([
      fetch("/api/developments"),
      fetch("/api/tasks"),
      fetch("/api/members"),
    ]);
    setProjects(await projRes.json());
    setTasks(await tasksRes.json());
    setMembers(await membersRes.json());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleExpand(projectId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(projects.map((p) => p.id)));
  }

  // Calculate date range
  const { startDate, endDate, totalDays, columns } = useMemo(() => {
    const allDates: Date[] = [];
    const now = new Date();
    allDates.push(now);

    // 表示対象（中止以外のプロジェクトと、それに紐づくタスク）だけで期間を決める。
    // 他所のタスクまで含めると、誰も見ない過去まで一気に伸びてしまう。
    const shown = projects.filter((p) => p.status !== "abandoned");
    const shownIds = new Set(shown.map((p) => p.id));
    shown.forEach((p) => {
      allDates.push(new Date(p.startDate ?? p.createdAt));
      if (p.releasedDate) allDates.push(new Date(p.releasedDate));
      (p.milestones ?? []).forEach((m) => allDates.push(new Date(m.date)));
    });
    tasks
      .filter((t) => t.developmentId && shownIds.has(t.developmentId))
      .forEach((t) => {
        allDates.push(new Date(t.startDate ?? t.createdAt));
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
  }, [projects, tasks]);

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

  // 中止したプロジェクトは表示しない
  const activeProjects = projects.filter((p) => p.status !== "abandoned");

  if (projects.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">ガントチャート</h2>
        <p className="text-gray-500">
          プロジェクトがありません。
          <Link href="/development" className="text-blue-600 hover:underline ml-1">プロジェクトを作成 →</Link>
        </p>
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

      <div className="bg-white shadow-sm rounded-xl border overflow-auto max-h-[calc(100vh-140px)]">
        <div className="flex">
          {/* Left panel - row labels */}
          <div className="sticky left-0 z-10 bg-white border-r min-w-[240px] shrink-0">
            {/* Month header placeholder */}
            <div className="h-8 border-b bg-gray-50" />
            {/* Day header placeholder */}
            <div className="h-8 border-b bg-gray-50 flex items-center px-3">
              <span className="text-xs font-medium text-gray-500">プロジェクト / タスク</span>
            </div>

            {activeProjects.map((project) => {
              const projectTasks = tasks.filter((t) => t.developmentId === project.id);
              const isExpanded = expanded.has(project.id);
              return (
                <div key={project.id}>
                  {/* Project row */}
                  <div
                    className="h-10 border-b flex items-center px-2 gap-1 cursor-pointer hover:bg-gray-50 font-medium text-sm"
                    onClick={() => toggleExpand(project.id)}
                  >
                    {projectTasks.length > 0 ? (
                      isExpanded ? <ChevronDown className="size-4 text-gray-400 shrink-0" /> : <ChevronRight className="size-4 text-gray-400 shrink-0" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <Link href={`/development/${project.id}`} className="text-blue-700 hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                      {project.title}
                    </Link>
                    <Badge className={`ml-auto text-xs shrink-0 ${getDevelopmentStatusColor(project.status)}`}>
                      {getDevelopmentStatusLabel(project.status)}
                    </Badge>
                  </div>
                  {/* Task rows */}
                  {isExpanded && projectTasks.map((task) => (
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

          {/* Right panel - chart
              幅を実寸で持たせないと、期間が長いとき横スクロールできず見切れる */}
          <div className="shrink-0" style={{ width: totalDays * cellWidth }}>
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
            {activeProjects.map((project) => {
              const projectTasks = tasks.filter((t) => t.developmentId === project.id);
              const isExpanded = expanded.has(project.id);

              // プロジェクトのバー: 開始日 → 完了日（未設定ならタスクの最終期限）
              const projectStart = dayOffset(project.startDate ?? project.createdAt);
              let projectEndDate = project.releasedDate;
              if (!projectEndDate) {
                const taskDueDates = projectTasks.filter((t) => t.dueDate).map((t) => new Date(t.dueDate!).getTime());
                if (taskDueDates.length > 0) projectEndDate = new Date(Math.max(...taskDueDates)).toISOString();
              }
              const projectEnd = projectEndDate ? dayOffset(projectEndDate) : projectStart + 7;
              const projectWidth = Math.max(projectEnd - projectStart, 1);

              return (
                <div key={project.id}>
                  {/* Project bar */}
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
                        left: projectStart * cellWidth,
                        width: projectWidth * cellWidth,
                        backgroundColor: "#3b82f6",
                      }}
                    />
                    {/* マイルストーン（◆） */}
                    {(project.milestones ?? []).map((ms) => (
                      <div
                        key={ms.id}
                        className="absolute z-10"
                        style={{ left: dayOffset(ms.date) * cellWidth + cellWidth / 2 - 5 }}
                        title={`${ms.title}（${new Date(ms.date).toLocaleDateString("ja-JP")}）`}
                      >
                        <div
                          className={`w-2.5 h-2.5 rotate-45 border-2 ${ms.done ? "bg-green-500 border-green-600" : "bg-amber-400 border-amber-600"}`}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Task bars */}
                  {isExpanded && projectTasks.map((task) => {
                    // 開始日があればそれを使う。無ければ従来どおり作成日から。
                    const taskStart = dayOffset(task.startDate ?? task.createdAt);
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
