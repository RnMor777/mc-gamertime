import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteGame, getGames, updateGame } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useActiveLibraryId } from "./useLibraries";

export function useGames(libraryIdOverride?: string) {
  const { user } = useAuth();
  const [storedLibraryId] = useActiveLibraryId();
  const effectiveLibraryId = libraryIdOverride ?? storedLibraryId ?? undefined;
  return useQuery({
    queryKey: effectiveLibraryId ? ["games", effectiveLibraryId] : ["games"],
    queryFn: () => (effectiveLibraryId ? getGames(effectiveLibraryId) : getGames()),
    enabled: !!user,
  });
}

export function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGame(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games"] });
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Game removed");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to remove game"),
  });
}

export function useUpdateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateGame>[1] }) =>
      updateGame(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games"] });
      toast.success("Game updated");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to update game"),
  });
}
