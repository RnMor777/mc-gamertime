import { useQuery } from "@tanstack/react-query";
import {
  FolderPlus,
  Library as LibraryIcon,
  Settings2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  useAddLibraryMember,
  useCreateLibrary,
  useDeleteLibrary,
  useLibraries,
  useRemoveLibraryMember,
  useUpdateLibrary,
  useUpdateLibraryMemberRole,
} from "../hooks/useLibraries";
import { getPlayers } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { LibraryRole, Player } from "../lib/types";
import { Avatar } from "./Avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";

const ROLE_LABELS: Record<LibraryRole, string> = {
  owner: "Owner",
  editor: "Editor",
  readonly: "Read-only",
  viewer: "Read-only",
};

export function LibraryBar({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { libraries, activeLibrary, activeLibraryId, setActiveLibraryId, canManageActiveLibrary } =
    useLibraries();

  const createLibrary = useCreateLibrary();
  const updateLibrary = useUpdateLibrary();
  const deleteLibrary = useDeleteLibrary();
  const addMember = useAddLibraryMember();
  const updateMemberRole = useUpdateLibraryMemberRole();
  const removeMember = useRemoveLibraryMember();

  const [showCreate, setShowCreate] = useState(false);
  const [newLibName, setNewLibName] = useState("");

  const [showManage, setShowManage] = useState(false);
  const [editName, setEditName] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<LibraryRole>("editor");

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["players"],
    queryFn: getPlayers,
    enabled: showManage && canManageActiveLibrary,
  });

  if (!user) return null;

  const canCreateLibrary = user.role === "admin" || user.role === "normal";
  const isFamily = Boolean(activeLibrary && !activeLibrary.isPersonal);
  const memberUsernames = new Set(activeLibrary?.members.map((m) => m.username) ?? []);
  const availablePlayers = players.filter((p) => !memberUsernames.has(p.pk));

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newLibName.trim()) return;
    try {
      const created = await createLibrary.mutateAsync(newLibName.trim());
      setNewLibName("");
      setShowCreate(false);
      setActiveLibraryId(created.id);
    } catch {
      /* toast handled by hook */
    }
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!activeLibrary || !editName.trim() || editName.trim() === activeLibrary.name) return;
    try {
      await updateLibrary.mutateAsync({ id: activeLibrary.id, name: editName.trim() });
    } catch {
      /* toast handled by hook */
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!activeLibrary || !selectedUser) return;
    try {
      await addMember.mutateAsync({
        libraryId: activeLibrary.id,
        username: selectedUser,
        role: selectedRole,
      });
      setSelectedUser("");
    } catch {
      /* toast handled by hook */
    }
  }

  async function handleDeleteLibrary() {
    if (!activeLibrary) return;
    if (
      !window.confirm(
        `Delete family library "${activeLibrary.name}" and its unreferenced games? This cannot be undone.`,
      )
    )
      return;
    try {
      await deleteLibrary.mutateAsync(activeLibrary.id);
      setShowManage(false);
      setActiveLibraryId(null);
    } catch {
      /* toast handled by hook */
    }
  }

  async function handleLeaveLibrary() {
    if (!activeLibrary || !user) return;
    if (!window.confirm(`Leave "${activeLibrary.name}"?`)) return;
    try {
      await removeMember.mutateAsync({
        libraryId: activeLibrary.id,
        username: user.sub,
      });
      setShowManage(false);
      setActiveLibraryId(null);
    } catch {
      /* toast handled by hook */
    }
  }

  function openManageDialog() {
    if (!activeLibrary) return;
    setEditName(activeLibrary.name);
    setSelectedUser("");
    setSelectedRole("editor");
    setShowManage(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 rounded-lg border bg-card/60">
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <LibraryIcon size={16} className="text-primary shrink-0" />
        <select
          aria-label="Select library"
          value={activeLibraryId}
          onChange={(e) => setActiveLibraryId(e.target.value)}
          className="h-8 px-2.5 text-sm font-medium rounded-md border border-input bg-background flex-1 sm:flex-none sm:min-w-[180px]"
        >
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.isPersonal ? `${lib.name} (Personal)` : `${lib.name} (Family)`}
            </option>
          ))}
        </select>
        {activeLibrary && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {activeLibrary.isPersonal && activeLibrary.members.length <= 1
              ? "Private"
              : `${ROLE_LABELS[activeLibrary.myRole]} · ${activeLibrary.members.length} member${activeLibrary.members.length === 1 ? "" : "s"}`}
          </Badge>
        )}
      </div>

      {!compact && (
        <div className="flex items-center gap-1.5 ml-auto">
          {activeLibrary && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openManageDialog}
              className="gap-1.5 h-8 text-xs"
            >
              {canManageActiveLibrary ? <Settings2 size={14} /> : <Users size={14} />}
              {canManageActiveLibrary
                ? isFamily
                  ? "Manage Family"
                  : "Manage Library"
                : "Library Members"}
            </Button>
          )}
          {canCreateLibrary && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreate(true)}
              className="gap-1.5 h-8 text-xs"
            >
              <FolderPlus size={14} />
              New Family Library
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setNewLibName("");
        }}
        title="Create Family Library"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Create a shared game library for your family or group. As the owner, you can invite
            members and choose whether they can edit or only view games.
          </p>
          <Input
            placeholder="Family library name (e.g. Smith Family)"
            value={newLibName}
            onChange={(e) => setNewLibName(e.target.value)}
            required
          />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                setNewLibName("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLibrary.isPending || !newLibName.trim()}>
              {createLibrary.isPending ? "Creating…" : "Create Library"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={showManage && !!activeLibrary}
        onClose={() => setShowManage(false)}
        title={
          canManageActiveLibrary
            ? `Manage ${activeLibrary?.name ?? ""}`
            : `${activeLibrary?.name ?? ""} Members`
        }
      >
        {activeLibrary && (
          <div className="space-y-4">
            {canManageActiveLibrary && (
              <form onSubmit={handleRename} className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Library Name</label>
                <div className="flex gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Library name"
                    required
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={
                      updateLibrary.isPending ||
                      !editName.trim() ||
                      editName.trim() === activeLibrary.name
                    }
                  >
                    Rename
                  </Button>
                </div>
              </form>
            )}

            {canManageActiveLibrary && (
              <form onSubmit={handleAddMember} className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Add User to Family Library
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="User to add"
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="h-10 px-3 text-sm rounded-md border border-input bg-background flex-1"
                  >
                    <option value="">Select a user…</option>
                    {availablePlayers.map((p) => (
                      <option key={p.pk} value={p.pk}>
                        {p.displayName} (@{p.pk})
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="New member role"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as LibraryRole)}
                    className="h-10 px-2 text-sm rounded-md border border-input bg-background"
                  >
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="readonly">Read-only</option>
                  </select>
                  <Button
                    type="submit"
                    disabled={!selectedUser || addMember.isPending}
                    className="gap-1 shrink-0"
                  >
                    <UserPlus size={14} />
                    Add
                  </Button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Members</p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {activeLibrary.members.map((m) => (
                  <div
                    key={m.username}
                    className="flex items-center justify-between p-2 rounded-md border bg-background text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={m.displayName} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{m.displayName}</p>
                        <p className="text-xs text-muted-foreground">@{m.username}</p>
                      </div>
                    </div>

                    {canManageActiveLibrary ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          aria-label={`Role for ${m.displayName}`}
                          value={m.role === "viewer" ? "readonly" : m.role}
                          onChange={(e) =>
                            updateMemberRole.mutate({
                              libraryId: activeLibrary.id,
                              username: m.username,
                              role: e.target.value as LibraryRole,
                            })
                          }
                          className="h-8 px-2 text-xs rounded-md border border-input bg-background"
                        >
                          <option value="owner">Owner</option>
                          <option value="editor">Editor</option>
                          <option value="readonly">Read-only</option>
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${m.displayName}`}
                          onClick={() =>
                            removeMember.mutate({
                              libraryId: activeLibrary.id,
                              username: m.username,
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              {isFamily ? (
                canManageActiveLibrary ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteLibrary}
                    disabled={deleteLibrary.isPending}
                    className="gap-1.5"
                  >
                    <Trash2 size={14} />
                    Delete Library
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLeaveLibrary}
                    disabled={removeMember.isPending}
                  >
                    Leave Library
                  </Button>
                )
              ) : (
                <span className="text-xs text-muted-foreground">Personal base library</span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowManage(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
