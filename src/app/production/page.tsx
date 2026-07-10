"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  PRODUCTION_STATUSES,
  getProductionStatusLabel,
  getProductionStatusColor,
} from "@/lib/production-status";
import { Plus, Search, Hammer, Users, Package as PackageIcon, Trash2 } from "lucide-react";
import { ProductionAchievement } from "@/components/production-achievement";
import { ProductionNeeded } from "@/components/production-needed";
import { PRODUCTION_STAGES, stageIndex } from "@/lib/production-stages";

interface Assignment {
  id: string;
  workerId: string;
  step: string | null;
  quantity: number;
  deliveredQty: number;
  deliveredDate: string | null;
  status: string;
  stage: string;
  cutDate: string | null;
  materialDate: string | null;
  handoverDate: string | null;
  inspectedDate: string | null;
  createdAt: string;
  note: string | null;
  worker: { id: string; name: string; color: string };
}

interface Production {
  id: string;
  productId: string;
  quantity: number;
  requestDate: string;
  dueDate: string | null;
  status: string;
  note: string | null;
  product: { id: string; code: string; name: string; series: string | null; workerCost: number | null };
  assignments: Assignment[];
}

interface Worker {
  id: string;
  name: string;
  color: string;
  type: string;
  specialties: string | null;
}

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  workerCost: number | null;
}

interface InventoryRow {
  id: string;
  stock: number;
}

export default function ProductionPage() {
  const [productions, setProductions] = useState<Production[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"list" | "worker" | "product">("product");
  const [deliverTarget, setDeliverTarget] = useState<{ assignment: Assignment; production: Production } | null>(null);
  const [assignTarget, setAssignTarget] = useState<Production | null>(null);
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null);
  const [achvKey, setAchvKey] = useState(0);

  // 製造データが変わったら達成状況パネルを再取得
  useEffect(() => { setAchvKey((k) => k + 1); }, [productions]);

  // 新規依頼ダイアログの工程行
  const [newRows, setNewRows] = useState<{ workerId: string; step: string; quantity: string }[]>([
    { workerId: "", step: "", quantity: "" },
  ]);

  const load = useCallback(async () => {
    const [prRes, wRes, pRes, iRes] = await Promise.all([
      fetch("/api/productions"),
      fetch("/api/members?type=worker"),
      fetch("/api/products"),
      fetch("/api/inventory"),
    ]);
    setProductions(await prRes.json());
    setWorkers(await wRes.json());
    setProducts(await pRes.json());
    setInventory(await iRes.json());
  }, []);

  async function quickCreateProduction(productId: string, workerId: string, quantity: number, requestDate: string, dueDate: string | null, note: string | null) {
    await fetch("/api/productions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        quantity,
        requestDate,
        dueDate,
        note,
        assignments: [{ workerId, quantity }],
      }),
    });
    load();
  }

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const validRows = newRows.filter((r) => r.workerId && r.quantity);
    await fetch("/api/productions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: form.get("productId"),
        quantity: Number(form.get("quantity")),
        requestDate: form.get("requestDate"),
        dueDate: form.get("dueDate") || null,
        note: form.get("note") || null,
        assignments: validRows.map((r) => ({
          workerId: r.workerId,
          step: r.step || null,
          quantity: Number(r.quantity),
        })),
      }),
    });
    setCreateOpen(false);
    setNewRows([{ workerId: "", step: "", quantity: "" }]);
    load();
  }

  async function changeAssignmentStatus(id: string, status: string) {
    await fetch("/api/productions/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  // 工程(stage)を進める/戻す。納品工程はダイアログで数量入力するため呼び出し側で分岐。
  async function advanceStage(id: string, stage: string) {
    await fetch("/api/productions/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stage }),
    });
    load();
  }

  async function handleDeliver(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!deliverTarget) return;
    const form = new FormData(e.currentTarget);
    await fetch("/api/productions/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: deliverTarget.assignment.id,
        deliveredQty: Number(form.get("deliveredQty")),
        deliveredDate: form.get("deliveredDate") || new Date().toISOString().split("T")[0],
        stage: "delivered",
      }),
    });
    setDeliverTarget(null);
    load();
  }

  async function addAssignment(productionId: string, workerId: string, step: string, quantity: number) {
    await fetch("/api/productions/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productionId, workerId, step: step || null, quantity }),
    });
    load();
  }

  async function removeAssignment(id: string) {
    await fetch("/api/productions/assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const filtered = productions.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.product.name.toLowerCase().includes(q) ||
        p.product.code.toLowerCase().includes(q) ||
        p.assignments.some((a) => a.worker.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // サマリー
  const totalRequested = productions.filter((p) => p.status !== "delivered")
    .reduce((s, p) => s + p.quantity, 0);
  const totalDelivered = productions.flatMap((p) => p.assignments)
    .filter((a) => a.status === "delivered")
    .reduce((s, a) => s + a.deliveredQty, 0);
  const inProgressCount = productions.flatMap((p) => p.assignments).filter((a) => a.status === "in_progress").length;
  const overdueCount = productions.filter((p) => {
    if (p.status === "delivered" || !p.dueDate) return false;
    return new Date(p.dueDate) < new Date();
  }).length;
  const activeWorkerIds = new Set(
    productions.flatMap((p) => p.assignments).filter((a) => a.status !== "delivered").map((a) => a.workerId)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">製造</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="商品・内職で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full sm:w-56"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">全ステータス</option>
            {PRODUCTION_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setView("worker")}
              title="内職別"
              className={`px-3 py-2 text-sm ${view === "worker" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              <Users className="size-4" />
            </button>
            <button
              onClick={() => setView("product")}
              title="商品別"
              className={`px-3 py-2 text-sm ${view === "product" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              <PackageIcon className="size-4" />
            </button>
            <button
              onClick={() => setView("list")}
              title="一覧"
              className={`px-3 py-2 text-sm ${view === "list" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              <Hammer className="size-4" />
            </button>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 製造依頼
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>新しい製造依頼</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">商品 *</label>
                    <select name="productId" required className="w-full border rounded-md px-3 py-2 text-sm">
                      <option value="">選択...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">全体数量 *</label>
                    <Input name="quantity" type="number" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">依頼日 *</label>
                    <Input name="requestDate" type="date" defaultValue={new Date().toISOString().split("T")[0]} required />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">納品予定日</label>
                    <Input name="dueDate" type="date" />
                  </div>
                </div>

                {/* 工程 / 内職割当 */}
                <div className="border rounded-lg p-3 bg-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-700">工程・内職への割当</p>
                    <button
                      type="button"
                      onClick={() => setNewRows([...newRows, { workerId: "", step: "", quantity: "" }])}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + 工程を追加
                    </button>
                  </div>
                  {newRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="工程名（任意）"
                        value={row.step}
                        onChange={(e) => {
                          const next = [...newRows];
                          next[i] = { ...row, step: e.target.value };
                          setNewRows(next);
                        }}
                        className="w-32"
                      />
                      <select
                        value={row.workerId}
                        onChange={(e) => {
                          const next = [...newRows];
                          next[i] = { ...row, workerId: e.target.value };
                          setNewRows(next);
                        }}
                        className="flex-1 border rounded-md px-2 py-2 text-sm"
                      >
                        <option value="">内職を選択</option>
                        {workers.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        placeholder="数量"
                        value={row.quantity}
                        onChange={(e) => {
                          const next = [...newRows];
                          next[i] = { ...row, quantity: e.target.value };
                          setNewRows(next);
                        }}
                        className="w-20"
                      />
                      {newRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewRows(newRows.filter((_, idx) => idx !== i))}
                          className="text-red-500 hover:bg-red-50 p-1 rounded"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">
                    1人で全工程やる場合は1行のみ。複数内職で分担する場合は工程を追加してください。
                  </p>
                </div>

                <div>
                  <label className="text-xs text-gray-500">備考</label>
                  <textarea name="note" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                </div>
                <Button type="submit" className="w-full">登録</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white shadow-sm border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">依頼中・制作中</p>
            <p className="text-2xl font-bold">{totalRequested.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{inProgressCount}工程 制作中</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">納品済み</p>
            <p className="text-2xl font-bold">{totalDelivered.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={`bg-white shadow-sm border-l-4 ${overdueCount > 0 ? "border-l-red-500" : "border-l-gray-300"}`}>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">納期超過</p>
            <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-600" : ""}`}>{overdueCount}</p>
            <p className="text-xs text-gray-400 mt-1">件</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">稼働中の内職</p>
            <p className="text-2xl font-bold">{activeWorkerIds.size}</p>
            <p className="text-xs text-gray-400 mt-1">/ {workers.length}名</p>
          </CardContent>
        </Card>
      </div>

      {/* 要製造（納品が必要な商品）— 対応者未割当も表示 */}
      <ProductionNeeded
        reloadKey={achvKey}
        onAssign={(pid) => {
          const p = products.find((x) => x.id === pid);
          if (p) setQuickAddProduct(p);
        }}
      />

      {/* 受注 vs 製造 達成状況 */}
      <ProductionAchievement reloadKey={achvKey} />

      {view === "product" ? (
        <ProductView
          productions={filtered}
          products={products}
          inventory={inventory}
          onStatusChange={changeAssignmentStatus}
          onStage={advanceStage}
          onDeliver={(a, p) => setDeliverTarget({ assignment: a, production: p })}
          onQuickAdd={setQuickAddProduct}
        />
      ) : filtered.length === 0 ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Hammer className="size-12 mx-auto mb-3 text-gray-300" />
            <p>製造データがありません</p>
            <p className="text-xs mt-1">右上の「製造依頼」から登録してください</p>
          </CardContent>
        </Card>
      ) : view === "worker" ? (
        <WorkerView
          workers={workers}
          productions={filtered}
          onStatusChange={changeAssignmentStatus}
          onDeliver={(a, p) => setDeliverTarget({ assignment: a, production: p })}
        />
      ) : (
        <ListView
          productions={filtered}
          onStatusChange={changeAssignmentStatus}
          onDeliver={(a, p) => setDeliverTarget({ assignment: a, production: p })}
          onAddAssignment={setAssignTarget}
          onRemoveAssignment={removeAssignment}
        />
      )}

      {/* 納品確定ダイアログ */}
      <Dialog open={!!deliverTarget} onOpenChange={(o) => !o && setDeliverTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>納品を記録</DialogTitle>
          </DialogHeader>
          {deliverTarget && (
            <form onSubmit={handleDeliver} className="space-y-3">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-sm">
                  <span className="font-mono text-xs text-gray-500">{deliverTarget.production.product.code}</span>
                </p>
                <p className="font-medium">{deliverTarget.production.product.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {deliverTarget.assignment.worker.name}
                  {deliverTarget.assignment.step && ` / ${deliverTarget.assignment.step}`}
                  {" "}/ 割当数: <span className="font-bold">{deliverTarget.assignment.quantity}</span>
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500">納品数 *</label>
                <Input
                  name="deliveredQty"
                  type="number"
                  defaultValue={deliverTarget.assignment.quantity}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">この数量が在庫に加算されます</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">納品日</label>
                <Input
                  name="deliveredDate"
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                />
              </div>
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                納品確定（在庫に加算）
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 工程追加ダイアログ */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>工程・内職を追加</DialogTitle>
          </DialogHeader>
          {assignTarget && (
            <AddAssignmentForm
              production={assignTarget}
              workers={workers}
              onAdd={async (workerId, step, qty) => {
                await addAssignment(assignTarget.id, workerId, step, qty);
                setAssignTarget(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 商品別クイック追加（1依頼=1内職） */}
      <Dialog open={!!quickAddProduct} onOpenChange={(o) => !o && setQuickAddProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>制作依頼を追加</DialogTitle>
          </DialogHeader>
          {quickAddProduct && (
            <QuickAddForm
              product={quickAddProduct}
              workers={workers}
              onAdd={async (workerId, qty, requestDate, dueDate, note) => {
                await quickCreateProduction(quickAddProduct.id, workerId, qty, requestDate, dueDate, note);
                setQuickAddProduct(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickAddForm({
  product,
  workers,
  onAdd,
}: {
  product: Product;
  workers: Worker[];
  onAdd: (workerId: string, quantity: number, requestDate: string, dueDate: string | null, note: string | null) => void;
}) {
  const [workerId, setWorkerId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!workerId || !quantity) return;
        onAdd(workerId, Number(quantity), requestDate, dueDate || null, note || null);
      }}
      className="space-y-3"
    >
      <div className="bg-gray-50 rounded p-3 text-sm">
        <p className="font-mono text-xs text-gray-500">{product.code}</p>
        <p className="font-medium">{product.name}</p>
      </div>
      <div>
        <label className="text-xs text-gray-500">内職 *</label>
        <select
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          <option value="">選択...</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500">数量（お渡し数）*</label>
        <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">依頼日 *</label>
          <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-gray-500">納品予定日</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">備考</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full border rounded-md px-3 py-2 text-sm resize-y"
        />
      </div>
      <Button type="submit" className="w-full">登録</Button>
    </form>
  );
}

function AddAssignmentForm({
  production,
  workers,
  onAdd,
}: {
  production: Production;
  workers: Worker[];
  onAdd: (workerId: string, step: string, quantity: number) => void;
}) {
  const [workerId, setWorkerId] = useState("");
  const [step, setStep] = useState("");
  const [quantity, setQuantity] = useState("");
  const totalAssigned = production.assignments.reduce((s, a) => s + a.quantity, 0);
  const remaining = production.quantity - totalAssigned;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!workerId || !quantity) return;
        onAdd(workerId, step, Number(quantity));
      }}
      className="space-y-3"
    >
      <div className="bg-gray-50 rounded p-3 text-sm">
        <p className="font-medium">{production.product.name}</p>
        <p className="text-xs text-gray-500 mt-1">
          全体: {production.quantity} / 既に割当: {totalAssigned} / 未割当: <span className={remaining > 0 ? "font-bold" : ""}>{remaining}</span>
        </p>
      </div>
      <div>
        <label className="text-xs text-gray-500">工程名（任意）</label>
        <Input value={step} onChange={(e) => setStep(e.target.value)} placeholder="例: 裁断、縫製" />
      </div>
      <div>
        <label className="text-xs text-gray-500">内職 *</label>
        <select
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          <option value="">選択...</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500">数量 *</label>
        <Input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full">追加</Button>
    </form>
  );
}

function AssignmentRow({
  assignment,
  production,
  onStatusChange,
  onDeliver,
}: {
  assignment: Assignment;
  production: Production;
  onStatusChange: (id: string, status: string) => void;
  onDeliver: (a: Assignment, p: Production) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: assignment.worker.color }} />
      <span className="font-medium">{assignment.worker.name}</span>
      {assignment.step && <span className="text-gray-500">[{assignment.step}]</span>}
      <span className="ml-auto">{assignment.quantity}</span>
      {assignment.status === "delivered" && (
        <span className="text-green-600">✓{assignment.deliveredQty}</span>
      )}
      <Badge className={`text-[10px] ${getProductionStatusColor(assignment.status)}`}>
        {getProductionStatusLabel(assignment.status)}
      </Badge>
      {assignment.status !== "delivered" && (
        <div className="flex gap-0.5">
          {assignment.status === "requested" && (
            <button
              onClick={() => onStatusChange(assignment.id, "in_progress")}
              className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 hover:bg-blue-100 text-blue-700"
            >
              開始
            </button>
          )}
          <button
            onClick={() => onDeliver(assignment, production)}
            className="text-[10px] px-1.5 py-0.5 rounded border bg-green-50 hover:bg-green-100 text-green-700"
          >
            納品
          </button>
        </div>
      )}
    </div>
  );
}

function ProductionCard({
  p,
  onStatusChange,
  onDeliver,
  onAddAssignment,
}: {
  p: Production;
  onStatusChange: (id: string, status: string) => void;
  onDeliver: (a: Assignment, p: Production) => void;
  onAddAssignment?: (p: Production) => void;
}) {
  const isOverdue = p.status !== "delivered" && p.dueDate && new Date(p.dueDate) < new Date();
  const totalDelivered = p.assignments.reduce((s, a) => s + a.deliveredQty, 0);
  return (
    <Card className={`bg-white shadow-sm hover:shadow-md transition-shadow ${isOverdue ? "border-red-200" : ""}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-mono">{p.product.code}</p>
            <p className="font-medium text-sm">{p.product.name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold">{p.quantity}</p>
            {totalDelivered > 0 && (
              <p className="text-xs text-green-600">納品 {totalDelivered}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span>依頼: {new Date(p.requestDate).toLocaleDateString("ja-JP")}</span>
          {p.dueDate && (
            <span className={isOverdue ? "text-red-600 font-medium" : ""}>
              納期: {new Date(p.dueDate).toLocaleDateString("ja-JP")}
            </span>
          )}
        </div>
        <div className="border-t pt-2 space-y-0.5">
          {p.assignments.map((a) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              production={p}
              onStatusChange={onStatusChange}
              onDeliver={onDeliver}
            />
          ))}
          {onAddAssignment && (
            <button
              onClick={() => onAddAssignment(p)}
              className="text-[10px] text-blue-600 hover:underline mt-1"
            >
              + 工程を追加
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkerView({
  workers,
  productions,
  onStatusChange,
  onDeliver,
}: {
  workers: Worker[];
  productions: Production[];
  onStatusChange: (id: string, status: string) => void;
  onDeliver: (a: Assignment, p: Production) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {workers.map((w) => {
        const items = productions
          .map((p) => ({
            production: p,
            assignments: p.assignments.filter((a) => a.workerId === w.id),
          }))
          .filter((x) => x.assignments.length > 0);
        const activeQty = items.flatMap((x) => x.assignments).filter((a) => a.status !== "delivered").reduce((s, a) => s + a.quantity, 0);
        return (
          <div key={w.id} className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
              <span className="font-medium">{w.name}</span>
              <span className="text-xs text-gray-500 ml-auto">
                {items.length}件 / 制作 {activeQty}個
              </span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg p-4 text-center text-xs text-gray-400">
                  依頼なし
                </div>
              ) : (
                items.map(({ production, assignments }) => (
                  <Card key={production.id} className="bg-white shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 font-mono">{production.product.code}</p>
                          <p className="font-medium text-sm">{production.product.name}</p>
                        </div>
                        {production.dueDate && (
                          <span className="text-xs text-gray-400">
                            ~{new Date(production.dueDate).toLocaleDateString("ja-JP")}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {assignments.map((a) => (
                          <AssignmentRow
                            key={a.id}
                            assignment={a}
                            production={production}
                            onStatusChange={onStatusChange}
                            onDeliver={onDeliver}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 6工程パイプラインのステッパー（対応者ごと）
function StageStepper({
  a,
  p,
  onStage,
  onDeliver,
}: {
  a: Assignment;
  p: Production;
  onStage: (id: string, stage: string) => void;
  onDeliver: (a: Assignment, p: Production) => void;
}) {
  const curIdx = stageIndex(a.stage);
  const dateOf: Record<string, string | null> = {
    assigned: a.createdAt,
    cut: a.cutDate,
    material: a.materialDate,
    handover: a.handoverDate,
    delivered: a.deliveredDate,
    inspected: a.inspectedDate,
  };
  function fmt(d: string | null) {
    if (!d) return "";
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  }
  return (
    <div className="flex items-stretch gap-1 flex-wrap">
      {PRODUCTION_STAGES.map((s, i) => {
        const done = i <= curIdx;
        const isCurrent = i === curIdx;
        const isNext = i === curIdx + 1;
        const clickable = i !== curIdx; // 現在地以外はクリックで移動（前後）
        const handle = () => {
          if (s.id === "delivered") onDeliver(a, p);
          else onStage(a.id, s.id);
        };
        return (
          <div key={s.id} className="flex items-center">
            <button
              onClick={clickable ? handle : undefined}
              disabled={!clickable}
              title={done ? `${s.label} ${fmt(dateOf[s.id])}` : `${s.label}へ進む`}
              className={[
                "px-2 py-1 rounded text-[11px] leading-tight border text-center min-w-[46px]",
                done
                  ? "bg-blue-600 text-white border-blue-600"
                  : isNext
                  ? "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                  : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50",
                isCurrent ? "ring-2 ring-blue-300" : "",
                clickable ? "cursor-pointer" : "cursor-default",
              ].join(" ")}
            >
              <span className="block">{s.short}</span>
              <span className="block text-[9px] opacity-80">{done ? fmt(dateOf[s.id]) || "✓" : ""}</span>
            </button>
            {i < PRODUCTION_STAGES.length - 1 && (
              <span className={`w-2 h-px ${i < curIdx ? "bg-blue-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductView({
  productions,
  products,
  inventory,
  onStatusChange,
  onStage,
  onDeliver,
  onQuickAdd,
}: {
  productions: Production[];
  products: Product[];
  inventory: InventoryRow[];
  onStatusChange: (id: string, status: string) => void;
  onStage: (id: string, stage: string) => void;
  onDeliver: (a: Assignment, p: Production) => void;
  onQuickAdd: (product: Product) => void;
}) {
  const stockMap = new Map(inventory.map((i) => [i.id, i.stock]));

  // 商品ごとに製造依頼をグループ化（製造データのある商品のみ表示）
  const groups = new Map<string, { product: Production["product"]; productions: Production[] }>();
  for (const p of productions) {
    const g = groups.get(p.productId);
    if (g) g.productions.push(p);
    else groups.set(p.productId, { product: p.product, productions: [p] });
  }

  // データのない商品も「+追加」できるようにリストに含める（オプショナル）
  // → 今回はデータのある商品のみ表示し、ヘッダーに「商品を選んで依頼」ボタン

  return (
    <div className="space-y-6">
      {/* 商品を選んで新規依頼（データのない商品にも依頼可能） */}
      <div className="bg-white shadow-sm border rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-2">商品を選択して新しい制作依頼を追加</p>
        <ProductPicker products={products} onPick={onQuickAdd} />
      </div>

      {groups.size === 0 && (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Hammer className="size-12 mx-auto mb-3 text-gray-300" />
            <p>まだ制作依頼がありません</p>
            <p className="text-xs mt-1">上の検索から商品を選んで依頼を追加してください</p>
          </CardContent>
        </Card>
      )}

      {[...groups.entries()].map(([productId, { product, productions }]) => {
        const carryOver = stockMap.get(productId) ?? 0;
        // 全Productionの全Assignmentをフラット化
        const rows = productions.flatMap((p) =>
          p.assignments.map((a) => ({ assignment: a, production: p }))
        );
        rows.sort((a, b) =>
          new Date(b.production.requestDate).getTime() - new Date(a.production.requestDate).getTime()
        );
        const totalRequested = rows
          .filter((r) => r.assignment.status !== "delivered")
          .reduce((s, r) => s + r.assignment.quantity, 0);
        const totalDelivered = rows
          .filter((r) => r.assignment.status === "delivered")
          .reduce((s, r) => s + r.assignment.deliveredQty, 0);

        return (
          <Card key={productId} className="bg-white shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50">
                <div>
                  <p className="font-mono text-xs text-gray-500">{product.code}</p>
                  <h3 className="font-bold text-base">{product.name}</h3>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">繰越（在庫）</p>
                    <p className="text-xl font-bold">{carryOver.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">未納品</p>
                    <p className="text-xl font-bold text-orange-600">{totalRequested.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">納品済合計</p>
                    <p className="text-xl font-bold text-green-600">{totalDelivered.toLocaleString()}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onQuickAdd(product as Product)}
                  >
                    <Plus className="size-4 mr-1" /> 依頼を追加
                  </Button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">対応者</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500 w-20">数量</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">納期</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">工程（クリックで進む・日付記録）</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(({ assignment: a, production: p }) => {
                    const isOverdue =
                      a.stage !== "inspected" && p.dueDate && new Date(p.dueDate) < new Date();
                    return (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 align-top">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.worker.color }} />
                            <span className="font-medium">{a.worker.name}</span>
                            {a.step && <span className="text-xs text-gray-500">[{a.step}]</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right align-top">
                          <span className="font-medium">{a.quantity}</span>
                          {a.deliveredQty > 0 && (
                            <span className="block text-[11px] text-green-600">納{a.deliveredQty}</span>
                          )}
                        </td>
                        <td className={`px-4 py-2 text-xs align-top ${isOverdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                          {p.dueDate ? new Date(p.dueDate).toLocaleDateString("ja-JP") : "-"}
                        </td>
                        <td className="px-4 py-2">
                          <StageStepper a={a} p={p} onStage={onStage} onDeliver={onDeliver} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ProductPicker({
  products,
  onPick,
}: {
  products: Product[];
  onPick: (p: Product) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = search
    ? products.filter(
        (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  return (
    <div className="relative">
      <Input
        placeholder="商品名・コードで検索..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && filtered.length > 0 && search && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto z-10">
          {filtered.slice(0, 20).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onPick(p);
                setSearch("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 border-b last:border-0"
            >
              <span className="font-mono text-xs text-gray-500 w-20">{p.code}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListView({
  productions,
  onStatusChange,
  onDeliver,
  onAddAssignment,
  onRemoveAssignment,
}: {
  productions: Production[];
  onStatusChange: (id: string, status: string) => void;
  onDeliver: (a: Assignment, p: Production) => void;
  onAddAssignment: (p: Production) => void;
  onRemoveAssignment: (id: string) => void;
}) {
  return (
    <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-500">商品</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">工程・内職割当</th>
            <th className="text-right px-4 py-3 font-medium text-gray-500">数量</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">依頼日</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">納期</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">状況</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {productions.map((p) => {
            const isOverdue = p.status !== "delivered" && p.dueDate && new Date(p.dueDate) < new Date();
            const totalDel = p.assignments.reduce((s, a) => s + a.deliveredQty, 0);
            return (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 align-top">
                  <div className="font-mono text-xs text-gray-500">{p.product.code}</div>
                  <div className="font-medium">{p.product.name}</div>
                </td>
                <td className="px-4 py-3 align-top space-y-1">
                  {p.assignments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.worker.color }} />
                      <span className="font-medium">{a.worker.name}</span>
                      {a.step && <span className="text-gray-500">[{a.step}]</span>}
                      <span className="ml-auto">{a.quantity}</span>
                      {a.status === "delivered" && <span className="text-green-600">✓{a.deliveredQty}</span>}
                      <Badge className={`text-[10px] ${getProductionStatusColor(a.status)}`}>
                        {getProductionStatusLabel(a.status)}
                      </Badge>
                      {a.status === "requested" && (
                        <button
                          onClick={() => onStatusChange(a.id, "in_progress")}
                          className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 hover:bg-blue-100 text-blue-700"
                        >
                          開始
                        </button>
                      )}
                      {a.status !== "delivered" && (
                        <button
                          onClick={() => onDeliver(a, p)}
                          className="text-[10px] px-1.5 py-0.5 rounded border bg-green-50 hover:bg-green-100 text-green-700"
                        >
                          納品
                        </button>
                      )}
                      <button
                        onClick={() => onRemoveAssignment(a.id)}
                        className="text-[10px] text-red-500 hover:bg-red-50 p-1 rounded"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => onAddAssignment(p)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + 工程追加
                  </button>
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <div className="font-bold">{p.quantity}</div>
                  {totalDel > 0 && <div className="text-xs text-green-600">納品 {totalDel}</div>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs align-top">
                  {new Date(p.requestDate).toLocaleDateString("ja-JP")}
                </td>
                <td className={`px-4 py-3 text-xs align-top ${isOverdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                  {p.dueDate ? new Date(p.dueDate).toLocaleDateString("ja-JP") : "-"}
                </td>
                <td className="px-4 py-3 align-top">
                  <Badge className={`text-xs ${getProductionStatusColor(p.status)}`}>
                    {getProductionStatusLabel(p.status)}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
