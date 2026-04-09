import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStageLabel, getStageColor } from "@/lib/stages";
import Link from "next/link";
import { ContactEditButton } from "./contact-edit";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      deals: { orderBy: { updatedAt: "desc" } },
      tasks: { orderBy: [{ completed: "asc" }, { dueDate: "asc" }] },
      notes: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!contact) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/contacts" className="text-gray-500 hover:text-gray-700">
          ← 顧客一覧
        </Link>
        <ContactEditButton contact={{
          id: contact.id,
          name: contact.name,
          company: contact.company,
          department: contact.department,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
        }} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>{contact.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {contact.company && (
              <div>
                <span className="text-gray-500">会社:</span>{" "}
                {contact.company}
              </div>
            )}
            {contact.department && (
              <div>
                <span className="text-gray-500">部署:</span>{" "}
                {contact.department}
              </div>
            )}
            {contact.title && (
              <div>
                <span className="text-gray-500">役職:</span>{" "}
                {contact.title}
              </div>
            )}
            {contact.email && (
              <div>
                <span className="text-gray-500">メール:</span>{" "}
                <a
                  href={`mailto:${contact.email}`}
                  className="text-blue-600 hover:underline"
                >
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div>
                <span className="text-gray-500">電話:</span>{" "}
                {contact.phone}
              </div>
            )}
            {contact.address && (
              <div>
                <span className="text-gray-500">住所:</span>{" "}
                {contact.address}
              </div>
            )}
            <div className="pt-2 text-xs text-gray-400">
              登録日: {new Date(contact.createdAt).toLocaleDateString("ja-JP")}
            </div>
          </CardContent>
        </Card>

        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                案件 ({contact.deals.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.deals.length === 0 ? (
                <p className="text-sm text-gray-500">案件なし</p>
              ) : (
                <div className="space-y-3">
                  {contact.deals.map((deal) => (
                    <div
                      key={deal.id}
                      className="flex items-center justify-between p-3 border rounded"
                    >
                      <div>
                        <p className="font-medium">{deal.title}</p>
                        <Badge className={getStageColor(deal.stage)}>
                          {getStageLabel(deal.stage)}
                        </Badge>
                      </div>
                      <div className="text-right">
                        {deal.amount != null && (
                          <p className="font-medium">
                            {deal.amount.toLocaleString()}円
                          </p>
                        )}
                        {deal.expectedCloseDate && (
                          <p className="text-xs text-gray-500">
                            予定:{" "}
                            {new Date(deal.expectedCloseDate).toLocaleDateString(
                              "ja-JP"
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                タスク ({contact.tasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.tasks.length === 0 ? (
                <p className="text-sm text-gray-500">タスクなし</p>
              ) : (
                <div className="space-y-2">
                  {contact.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between p-2 rounded ${
                        task.completed ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{task.completed ? "✓" : "○"}</span>
                        <span
                          className={
                            task.completed ? "line-through text-gray-400" : ""
                          }
                        >
                          {task.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            task.priority === "high"
                              ? "border-red-300 text-red-700"
                              : task.priority === "low"
                              ? "border-gray-300 text-gray-500"
                              : ""
                          }
                        >
                          {task.priority === "high"
                            ? "高"
                            : task.priority === "low"
                            ? "低"
                            : "中"}
                        </Badge>
                      </div>
                      {task.dueDate && (
                        <span className="text-xs text-gray-500">
                          {new Date(task.dueDate).toLocaleDateString("ja-JP")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                メモ ({contact.notes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.notes.length === 0 ? (
                <p className="text-sm text-gray-500">
                  メモなし。
                  <Link href="/notes" className="text-blue-600 hover:underline ml-1">
                    メモページでインポート・紐づけ
                  </Link>
                </p>
              ) : (
                <div className="space-y-3">
                  {contact.notes.map((note) => (
                    <div key={note.id} className="border rounded p-3">
                      <p className="font-medium text-sm">{note.title}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-3">
                        {note.body}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(note.updatedAt).toLocaleDateString("ja-JP")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
