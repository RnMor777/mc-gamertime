import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("./api");

function Consumer() {
  const { user, logout, setUser } = useAuth();
  return (
    <>
      <span>{user ? user.sub : "anonymous"}</span>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
      <button type="button" onClick={() => setUser(null)}>
        expire
      </button>
    </>
  );
}

async function renderSignedIn() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("alice");
  // Per-user data: isFavorited and the notification inbox belong to alice.
  qc.setQueryData(["games"], [{ pk: "g1", isFavorited: true }]);
  qc.setQueryData(["notifications"], { notifications: [], unreadCount: 3 });
  return qc;
}

beforeEach(() => {
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    sub: "alice",
    role: "normal",
    displayName: "Alice",
  });
  vi.mocked(api.logout).mockResolvedValue(undefined);
});

describe("AuthProvider", () => {
  it("drops the previous user's cached data on logout", async () => {
    const qc = await renderSignedIn();
    await userEvent.click(screen.getByText("logout"));
    await screen.findByText("anonymous");
    await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(0));
  });

  it("drops cached data when the session expires (401 clears the user)", async () => {
    const qc = await renderSignedIn();
    await userEvent.click(screen.getByText("expire"));
    await screen.findByText("anonymous");
    await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(0));
  });
});
