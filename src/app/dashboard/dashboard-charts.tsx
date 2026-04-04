"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STAGE_COLORS: Record<string, string> = {
  inquiry: "#9ca3af",
  hearing: "#3b82f6",
  prototype: "#f97316",
  estimate: "#eab308",
  sample: "#a855f7",
  decided: "#22c55e",
  manufacturing: "#059669",
};

const TASK_COLORS: Record<string, string> = {
  todo: "#9ca3af",
  in_progress: "#3b82f6",
  waiting: "#eab308",
  done: "#22c55e",
};

type PipelineItem = {
  id: string;
  label: string;
  count: number;
  amount: number;
};

type TaskStatusItem = {
  name: string;
  value: number;
  id: string;
};

export function DashboardCharts({
  pipelineData,
  taskStatusData,
}: {
  pipelineData: PipelineItem[];
  taskStatusData: TaskStatusItem[];
}) {
  const chartData = pipelineData.map((s) => ({
    name: s.label,
    件数: s.count,
    金額: Math.round(s.amount / 10000),
    fill: STAGE_COLORS[s.id] || "#6b7280",
  }));

  const taskTotal = taskStatusData.reduce((sum, s) => sum + s.value, 0);
  const activeTaskData = taskStatusData.filter((s) => s.value > 0);

  if (taskTotal === 0 && chartData.every((d) => d.件数 === 0)) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {chartData.some((d) => d.件数 > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ステージ別案件</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) =>
                    name === "金額" ? [`${value}万円`, name] : [value, name]
                  }
                />
                <Bar dataKey="件数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {taskTotal > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">タスク状況</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={activeTaskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {activeTaskData.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={TASK_COLORS[entry.id] || "#6b7280"}
                    />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
