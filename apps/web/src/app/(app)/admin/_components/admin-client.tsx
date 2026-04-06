"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import CreateUserDialog from "./create-user-dialog";
import UserDetailPanel, { type AdminUser } from "./user-detail-panel";
import HealthSection from "./health-section";

async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  const json = await res.json() as { data: AdminUser[] };
  return json.data;
}

/**
 * Admin dashboard client — users table + health section.
 */
export default function AdminClient() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
    staleTime: 30_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }, [queryClient]);

  function handleUpdated() {
    refresh();
    setSelectedUser(null);
  }

  function handleDeleted() {
    refresh();
    setSelectedUser(null);
  }

  return (
    <div className="space-y-8">
      {/* Users section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Administration</h1>
            <p className="mt-1 text-sm text-stone-500">Manage user accounts and monitor system health.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>New User</Button>
        </div>

        {/* User detail panel */}
        {selectedUser && (
          <UserDetailPanel
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        )}

        {/* Users table */}
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-stone-100" />
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white px-6 py-16 text-center">
            <p className="text-sm text-stone-500">No users yet. Create the first account.</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              New User
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">Email</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">Last Login</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-stone-400">Uploads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`cursor-pointer hover:bg-stone-50 ${
                      !user.isActive ? "opacity-50" : ""
                    } ${selectedUser?.id === user.id ? "bg-stone-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-stone-900">
                      {user.email}
                      {user.role === "ADMIN" && (
                        <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                          Admin
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          user.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-500">
                      {user.statementCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System health section */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-stone-900">System Health</h2>
        <HealthSection />
      </div>

      {/* Create user dialog */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />
    </div>
  );
}
