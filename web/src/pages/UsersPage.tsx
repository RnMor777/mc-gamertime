import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Avatar } from "../components/Avatar";
import { PageTransition } from "../components/PageTransition";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { useAuth } from "../lib/AuthContext";
import { createUser, deleteUser, getUsers, updateUser } from "../lib/api";
import type { UserRole, UserSummary } from "../lib/types";

const EMPTY_CREATE: {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
} = {
  username: "",
  displayName: "",
  password: "",
  role: "normal",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery<UserSummary[]>({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState("");

  const [editTarget, setEditTarget] = useState<UserSummary | null>(null);
  const [editForm, setEditForm] = useState<{
    displayName: string;
    role: UserRole;
    password: string;
  }>({
    displayName: "",
    role: "normal",
    password: "",
  });
  const [editError, setEditError] = useState("");

  const { user: currentUser } = useAuth();

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      setCreateError("");
      toast.success("User created");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Failed to create user";
      setCreateError(msg);
      toast.error(msg);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({
      username,
      data,
    }: {
      username: string;
      data: Parameters<typeof updateUser>[1];
    }) => updateUser(username, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditTarget(null);
      setEditError("");
      toast.success("User updated");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Failed to update user";
      setEditError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (username: string) => deleteUser(username),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to delete user"),
  });

  function handleDelete(u: UserSummary) {
    if (!window.confirm(`Delete ${u.displayName} (@${u.username})? This cannot be undone.`)) return;
    deleteMutation.mutate(u.username);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError("");
    try {
      await createMutation.mutateAsync(createForm);
    } catch {
      // error handled in onError
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError("");
    if (editTarget.username === currentUser?.sub && editForm.role !== editTarget.role) {
      setEditError("You cannot change your own role.");
      return;
    }
    const data: Parameters<typeof updateUser>[1] = {};
    if (editForm.displayName !== editTarget.displayName) data.displayName = editForm.displayName;
    if (editForm.role !== editTarget.role) data.role = editForm.role;
    if (editForm.password) data.password = editForm.password;
    if (Object.keys(data).length === 0) {
      toast("No changes to save");
      setEditTarget(null);
      return;
    }
    try {
      await editMutation.mutateAsync({ username: editTarget.username, data });
    } catch {
      // error handled in onError
    }
  }

  function openEdit(u: UserSummary) {
    setEditForm({ displayName: u.displayName, role: u.role, password: "" });
    setEditError("");
    setEditTarget(u);
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Users size={24} className="text-primary" />
            Users
          </h1>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus size={16} />
            Create User
          </Button>
        </div>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}

        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.username}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors"
            >
              <Link
                to={`/players/${u.username}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <Avatar name={u.displayName} size="md" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.displayName}</p>
                  <p className="text-sm text-muted-foreground">@{u.username}</p>
                </div>
              </Link>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${u.displayName}`}
                  onClick={() => openEdit(u)}
                >
                  <Pencil size={14} />
                </Button>
                {u.username !== currentUser?.sub && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${u.displayName}`}
                    onClick={() => handleDelete(u)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Dialog
          open={showCreate}
          onClose={() => {
            setShowCreate(false);
            setCreateForm(EMPTY_CREATE);
            setCreateError("");
          }}
          title="Create User"
        >
          <form onSubmit={handleCreate} className="space-y-3">
            <Input
              placeholder="Username"
              value={createForm.username}
              onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
              required
            />
            <Input
              placeholder="Display name"
              value={createForm.displayName}
              onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="admin">Admin</option>
            </select>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  setCreateForm(EMPTY_CREATE);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-1.5">
                <Plus size={16} />
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </Dialog>

        <Dialog
          open={editTarget !== null}
          onClose={() => {
            setEditTarget(null);
            setEditError("");
          }}
          title={`Edit ${editTarget?.displayName ?? ""}`}
        >
          <form onSubmit={handleEdit} className="space-y-3">
            <Input
              placeholder="Display name"
              value={editForm.displayName}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              required
            />
            <select
              value={editForm.role}
              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="admin">Admin</option>
            </select>
            <Input
              type="password"
              placeholder="New password (leave blank to keep current)"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
            />
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditTarget(null);
                  setEditError("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </PageTransition>
  );
}
