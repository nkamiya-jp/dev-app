"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ContactFormDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const data = {
      name: form.get("name") as string,
      company: (form.get("company") as string) || null,
      department: (form.get("department") as string) || null,
      title: (form.get("title") as string) || null,
      email: (form.get("email") as string) || null,
      phone: (form.get("phone") as string) || null,
    };
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setLoading(false);
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        + 顧客を追加
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新しい顧客</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input name="name" placeholder="名前 *" required />
          <Input name="company" placeholder="会社名" />
          <Input name="department" placeholder="部署" />
          <Input name="title" placeholder="役職" />
          <Input name="email" placeholder="メールアドレス" type="email" />
          <Input name="phone" placeholder="電話番号" />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "保存中..." : "保存"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
