import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import type { Game } from "../lib/types";
import { AddExpansionDialog } from "./AddExpansionDialog";

vi.mock("../lib/api");

const baseGame: Game = {
  pk: "01GAME",
  name: "Catan",
  tags: [],
  createdAt: "2026-01-01T00:00:00Z",
  expansions: [
    {
      id: "exp-existing",
      name: "Catan: Cities & Knights",
      bggId: 925,
    },
  ],
};

function renderDialog(game: Game = baseGame) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddExpansionDialog open onClose={() => {}} game={game} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  vi.mocked(api.searchBggExpansions).mockResolvedValue([
    { bggId: 926, name: "Catan: Seafarers", yearPublished: 1997 },
    { bggId: 925, name: "Catan: Cities & Knights", yearPublished: 1998 },
  ]);
  vi.mocked(api.getBggDetail).mockResolvedValue({
    bggId: 926,
    name: "Catan: Seafarers",
    yearPublished: 1997,
    description: "Sail across the seas of Catan.",
    minPlayers: 3,
    maxPlayers: 4,
    playTime: 90,
    weight: 2.4,
  });
  vi.mocked(api.addGameExpansion).mockResolvedValue(baseGame);
});

describe("AddExpansionDialog", () => {
  it("automatically searches BGG expansions based on the base game name on open", async () => {
    renderDialog();

    await waitFor(() => expect(api.searchBggExpansions).toHaveBeenCalledWith("Catan"));
    expect(await screen.findByText("Catan: Seafarers")).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
  });

  it("supports free-text expansion search and adds the selected BGG expansion", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText("Catan: Seafarers");
    const input = screen.getByPlaceholderText("Search BGG expansions…");
    await user.clear(input);
    await user.type(input, "Seafarers");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(api.searchBggExpansions).toHaveBeenCalledWith("Seafarers"));
    await user.click(await screen.findByText("Catan: Seafarers"));
    await user.click(await screen.findByRole("button", { name: "Add Expansion" }));

    await waitFor(() =>
      expect(api.addGameExpansion).toHaveBeenCalledWith(
        "01GAME",
        expect.objectContaining({
          bggId: 926,
          name: "Catan: Seafarers",
          description: "Sail across the seas of Catan.",
        }),
      ),
    );
  });

  it("allows adding a manual expansion", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Manual entry" }));
    await user.type(screen.getByLabelText("Expansion name"), "Catan: Custom Islands");
    await user.type(screen.getByLabelText("Description (optional)"), "Fan-made scenarios");
    await user.click(screen.getByRole("button", { name: "Add Expansion" }));

    await waitFor(() =>
      expect(api.addGameExpansion).toHaveBeenCalledWith(
        "01GAME",
        expect.objectContaining({
          name: "Catan: Custom Islands",
          description: "Fan-made scenarios",
        }),
      ),
    );
  });
});
