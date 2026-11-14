import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/AuthContext";
import * as api from "../lib/api";
import LoginPage from "./LoginPage";

vi.mock("../lib/api");

function renderLoginPage(initialEntries: string[] = ["/login"]) {
  // LoginPage reads the instance display name through TanStack Query.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getCurrentUser).mockRejectedValue(new Error("not logged in"));
  vi.mocked(api.getAuthConfig).mockResolvedValue({
    oidcEnabled: false,
    disableLocalAuth: false,
    oidcButtonLabel: "Sign in with SSO",
  });
});

describe("LoginPage", () => {
  it("shows the configured instance display name", async () => {
    vi.mocked(api.getPublicSettings).mockResolvedValue({
      displayName: "Friday Games",
      showProjectInfo: false,
      sourceUrl: null,
      docsUrl: null,
    });

    renderLoginPage();

    expect(await screen.findByText("Friday Games")).toBeInTheDocument();
    expect(screen.queryByText("MC GamerTime")).not.toBeInTheDocument();
  });

  it("logs in and redirects on valid credentials", async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockResolvedValue({
      username: "alice",
      displayName: "Alice",
      role: "admin",
    } as any);

    renderLoginPage();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("alice", "secret"));
  });

  it("shows a rate-limit message on 429", async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockRejectedValue({ status: 429, retryAfter: 30 });

    renderLoginPage();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/try again in 30 seconds/i)).toBeInTheDocument();
  });

  it("shows invalid-credentials message when the API is healthy", async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockRejectedValue({ status: 401 });
    vi.mocked(api.checkHealth).mockResolvedValue(true);

    renderLoginPage();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
  });

  it("shows SSO button when oidc is enabled alongside local auth", async () => {
    vi.mocked(api.getAuthConfig).mockResolvedValue({
      oidcEnabled: true,
      disableLocalAuth: false,
      oidcButtonLabel: "Single Sign-On",
    });

    renderLoginPage();

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Single Sign-On" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Single Sign-On" })).toHaveAttribute(
      "href",
      "/api/auth/oidc/login",
    );
  });

  it("hides local auth form and shows only SSO button when disableLocalAuth is true", async () => {
    vi.mocked(api.getAuthConfig).mockResolvedValue({
      oidcEnabled: true,
      disableLocalAuth: true,
      oidcButtonLabel: "Sign in with Google",
    });

    renderLoginPage();

    expect(await screen.findByRole("link", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();
  });

  it("displays SSO error alert when error query parameter is present", async () => {
    renderLoginPage(["/login?error=access_denied"]);

    expect(
      await screen.findByText("Sign in was cancelled or access was denied."),
    ).toBeInTheDocument();
  });
});
