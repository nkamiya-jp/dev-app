"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  company: string | null;
  department: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export function ContactEditButton({ contact }: { contact: Contact }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const data = {
      name: form.get("name"),
      company: form.get("company") || null,
      department: form.get("department") || null,
      title: form.get("title") || null,
      email: form.get("email") || null,
      phone: form.get("phone") || null,
      address: form.get("address") || null,
    };

    await fetch(`/api/contacts/${contact.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
      >
        <Pencil className="size-4 mr-1" /> 編集
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>顧客を編集</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">名前 *</label>
            <Input name="name" defaultValue={contact.name} required />
          </div>
          <div>
            <label className="text-xs text-gray-500">会社</label>
            <Input name="company" defaultValue={contact.company || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">部署</label>
            <Input name="department" defaultValue={contact.department || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">役職</label>
            <Input name="title" defaultValue={contact.title || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">メール</label>
            <Input name="email" type="email" defaultValue={contact.email || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">電話</label>
            <Input name="phone" defaultValue={contact.phone || ""} />
          </div>
          <div>
            <label className="text-xs text-gray-500">住所</label>
            <Input name="address" defaultValue={contact.address || ""} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
