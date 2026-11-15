import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addGameExpansion,
  deleteGame,
  deleteGameExpansion,
  getGames,
  updateGame,
} from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { GameExpansionInput } from "../lib/types";
import { useLibraries } from "./useLibraries";

export function useGames(libraryIdOverride?: string) {
  const { user } = useAuth();
  const { selectedFamilyLibraryId } = useLibraries();
  const effectiveLibraryId = libraryIdOverride ?? selectedFamilyLibraryId ?? undefined;
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

export function useAddGameExpansion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, expansion }: { gameId: string; expansion: GameExpansionInput }) =>
      addGameExpansion(gameId, expansion),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games"] });
      toast.success("Expansion added");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to add expansion"),
  });
}

export function useDeleteGameExpansion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, expansionId }: { gameId: string; expansionId: string }) =>
      deleteGameExpansion(gameId, expansionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games"] });
      toast.success("Expansion removed");
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : "Failed to remove expansion"),
  });
}
