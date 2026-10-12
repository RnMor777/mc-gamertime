import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { AddGameDialog } from "./AddGameDialog";

vi.mock("../lib/api");

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddGameDialog open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

async function searchAndSelect(resultName: string) {
  const user = userEvent.setup();
  renderDialog();
  await user.type(screen.getByPlaceholderText("Search BoardGameGeek…"), "Siedler");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByText(resultName));
  await user.click(await screen.findByRole("button", { name: "Add to Catalog" }));
}

beforeEach(() => {
  // jsdom has no HTMLDialogElement.showModal/close
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  vi.mocked(api.getBggDetail).mockResolvedValue({ bggId: 13, name: "CATAN", yearPublished: 1995 });
  vi.mocked(api.addGame).mockResolvedValue({} as any);
});

describe("AddGameDialog", () => {
  // BGG search matches alternate names; the user expects the name they clicked, not the primary.
  it("saves the alternate name the user searched for", async () => {
    vi.mocked(api.searchBgg).mockResolvedValue([
      { bggId: 13, name: "Die Siedler von Catan", yearPublished: 1995 },
    ]);

    await searchAndSelect("Die Siedler von Catan");

    await waitFor(() =>
      expect(api.addGame).toHaveBeenCalledWith(
        expect.objectContaining({ bggId: 13, name: "Die Siedler von Catan" }),
      ),
    );
  });

  it("falls back to the BGG primary name when the search result has none", async () => {
    vi.mocked(api.searchBgg).mockResolvedValue([{ bggId: 13, name: "", yearPublished: 1995 }]);

    await searchAndSelect("(1995)");

    await waitFor(() =>
      expect(api.addGame).toHaveBeenCalledWith(expect.objectContaining({ name: "CATAN" })),
    );
  });
});
