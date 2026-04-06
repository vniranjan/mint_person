"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useToast } from "~/hooks/use-toast";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  statementCount: number;
}

interface UserDetailPanelProps {
  user: AdminUser;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

/**
 * Inline detail panel shown when an admin clicks a user row.
 * Shows operational metrics only — no financial data values (Story 5.2 AC1).
 */
export default function UserDetailPanel({
  user,
  onClose,
  onUpdated,
  onDeleted,
}: UserDetailPanelProps) {
  const { toast } = useToast();
  const [transactionCount, setTransactionCount] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Fetch detail metrics whenever the selected user changes
  useEffect(() => {
    setLoadingDetail(true);
    setTransactionCount(null);
    fetch(`/api/admin/users/${user.id}`)
      .then((r) => r.json() as Promise<{ data: { transactionCount: number } }>)
      .then((json) => setTransactionCount(json.data.transactionCount))
      .catch(() => setTransactionCount(0))
      .finally(() => setLoadingDetail(false));
  }, [user.id]);

  async function handleDeactivate() {
    setIsPending(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate" }),
      });
      if (!res.ok) throw new Error("Failed to deactivate user");
      toast({ title: `${user.email} deactivated`, variant: "success" });
      setDeactivateOpen(false);
      onUpdated();
    } catch {
      toast({ title: "Failed to deactivate. Please try again.", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  }

  async function handleReactivate() {
    setIsPending(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });
      if (!res.ok) throw new Error("Failed to reactivate user");
      toast({ title: `${user.email} reactivated`, variant: "success" });
      onUpdated();
    } catch {
      toast({ title: "Failed to reactivate. Please try again.", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete() {
    setIsPending(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const json = await res.json() as { error?: { message: string } };
      if (!res.ok) {
        toast({ title: json.error?.message ?? "Failed to delete user", variant: "destructive" });
        return;
      }
      toast({ title: "User and all data permanently deleted", variant: "success" });
      setDeleteOpen(false);
      onDeleted();
    } catch {
      toast({ title: "Failed to delete. Please try again.", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  }

  const lastActivity = user.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Never";

  return (
    <>
      <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-stone-900">{user.email}</p>
            <p className="mt-0.5 text-xs text-stone-400">{user.role} · ID: {user.id.slice(0, 8)}…</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 text-sm"
            aria-label="Close detail panel"
          >
            ×
          </button>
        </div>

        {/* Financial data notice */}
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Financial data not accessible to admins
        </p>

        {/* Operational metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
            <p className="text-xs text-stone-400">Uploads</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-stone-900">
              {user.statementCount}
            </p>
          </div>
          <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
            <p className="text-xs text-stone-400">Transactions</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-stone-900">
              {loadingDetail ? "…" : (transactionCount ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
            <p className="text-xs text-stone-400">Last Login</p>
            <p className="mt-1 text-sm font-medium text-stone-900">{lastActivity}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          {user.isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeactivateOpen(true)}
              disabled={isPending}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReactivate}
              disabled={isPending}
            >
              {isPending ? "Reactivating…" : "Reactivate"}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Deactivate confirmation dialog */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate user?</DialogTitle>
            <DialogDescription>
              Deactivate <strong>{user.email}</strong>? They will not be able to log in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeactivateOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={isPending}>
              {isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Permanently delete user?</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{user.email}</strong>? All their transactions, statements,
              and history will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
