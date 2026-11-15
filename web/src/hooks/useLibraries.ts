import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  addLibraryMember,
  createLibrary,
  deleteLibrary,
  getLibraries,
  removeLibraryMember,
  updateLibrary,
  updateLibraryMemberRole,
} from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { Library, LibraryRole } from "../lib/types";

const listeners = new Set<() => void>();

function notifyListeners() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function storageKey(sub?: string | null) {
  return sub ? `active-library:${sub}` : "active-library";
}

export function getStoredLibraryId(sub?: string | null): string | null {
  try {
    return localStorage.getItem(storageKey(sub));
  } catch {
    return null;
  }
}

export function setStoredLibraryId(sub: string | null | undefined, libraryId: string | null) {
  try {
    const key = storageKey(sub);
    if (!libraryId || libraryId === `personal:${sub}`) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, libraryId);
    }
  } catch {
    /* ignore storage errors */
  }
  notifyListeners();
}

export function useActiveLibraryId() {
  const { user } = useAuth();
  const sub = user?.sub;
  const activeId = useSyncExternalStore(
    subscribe,
    () => getStoredLibraryId(sub),
    () => null,
  );
  const setActiveId = useCallback(
    (id: string | null) => {
      setStoredLibraryId(sub, id);
    },
    [sub],
  );
  return [activeId, setActiveId] as const;
}

export function useLibraries() {
  const { user } = useAuth();
  const [storedId, setActiveLibraryId] = useActiveLibraryId();
  const query = useQuery<Library[]>({
    queryKey: ["libraries", user?.sub],
    queryFn: getLibraries,
    enabled: !!user,
  });

  const personalId =
    query.data?.find((l) => l.isPersonal)?.id ?? (user ? `personal:${user.sub}` : "");
  const fallbackPersonal: Library | null = user
    ? {
        id: personalId,
        name: "My Library",
        isPersonal: true,
        ownerId: user.sub,
        myRole: "owner",
        members: [
          {
            username: user.sub,
            displayName: user.displayName,
            role: "owner",
          },
        ],
        gameCount: 0,
      }
    : null;

  const libraries =
    query.data && query.data.length > 0 ? query.data : fallbackPersonal ? [fallbackPersonal] : [];
  const activeLibrary =
    (storedId ? libraries.find((l) => l.id === storedId) : libraries.find((l) => l.isPersonal)) ??
    libraries[0] ??
    fallbackPersonal;

  const canEditActiveLibrary = Boolean(
    user &&
    (user.role === "admin" ||
      !activeLibrary ||
      activeLibrary.myRole === "owner" ||
      activeLibrary.myRole === "editor"),
  );

  const canManageActiveLibrary = Boolean(
    user &&
    activeLibrary &&
    !activeLibrary.isPersonal &&
    (user.role === "admin" || activeLibrary.myRole === "owner"),
  );

  const handleSetActiveLibraryId = useCallback(
    (id: string | null) => {
      if (!id || id === personalId) {
        setActiveLibraryId(null);
      } else {
        setActiveLibraryId(id);
      }
    },
    [personalId, setActiveLibraryId],
  );

  return {
    ...query,
    libraries,
    activeLibrary,
    activeLibraryId: activeLibrary?.id ?? personalId,
    selectedFamilyLibraryId:
      storedId && activeLibrary && !activeLibrary.isPersonal ? activeLibrary.id : undefined,
    setActiveLibraryId: handleSetActiveLibraryId,
    canEditActiveLibrary,
    canManageActiveLibrary,
  };
}

export function useCreateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createLibrary(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Family library created");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to create library"),
  });
}

export function useUpdateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateLibrary(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Library updated");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to update library"),
  });
}

export function useDeleteLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLibrary(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      qc.invalidateQueries({ queryKey: ["games"] });
      toast.success("Library deleted");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to delete library"),
  });
}

export function useAddLibraryMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      libraryId,
      username,
      role,
    }: {
      libraryId: string;
      username: string;
      role: LibraryRole;
    }) => addLibraryMember(libraryId, username, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Member updated");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to add member"),
  });
}

export function useUpdateLibraryMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      libraryId,
      username,
      role,
    }: {
      libraryId: string;
      username: string;
      role: LibraryRole;
    }) => updateLibraryMemberRole(libraryId, username, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Member role updated");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to update role"),
  });
}

export function useRemoveLibraryMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ libraryId, username }: { libraryId: string; username: string }) =>
      removeLibraryMember(libraryId, username),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      qc.invalidateQueries({ queryKey: ["games"] });
      toast.success("Member removed");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to remove member"),
  });
}
