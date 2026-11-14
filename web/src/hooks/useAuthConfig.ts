import { useQuery } from "@tanstack/react-query";
import { getAuthConfig } from "../lib/api";

export function useAuthConfig() {
  return useQuery({
    queryKey: ["auth", "config"],
    queryFn: getAuthConfig,
  });
}
