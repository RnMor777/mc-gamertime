import { describe, expect, it } from "vitest";
import { buildInitialState, formReducer } from "./LogResultDialog";

describe("formReducer", () => {
  it("clears per-player variables and seats when switching games", () => {
    // Stale variables/seats from the previous game must not survive a game
    // switch — their keys are tied to the old game's playerVariables[].id
    // set and would 422 on submit (see CLAUDE.md note on _validate_player_config).
    const state = {
      ...buildInitialState({}),
      gameId: "old-game",
      selected: ["alice", "bob"],
      variables: { alice: { color: "red" }, bob: { color: "blue" } },
      seats: { alice: 1, bob: 2 },
    };

    const next = formReducer(state, { type: "SET_GAME", gameId: "new-game" });

    expect(next.gameId).toBe("new-game");
    expect(next.variables).toEqual({});
    expect(next.seats).toEqual({});
  });

  it("removes only the deselected player's variables and seat, keeping others", () => {
    const state = {
      ...buildInitialState({}),
      selected: ["alice", "bob"],
      variables: { alice: { color: "red" }, bob: { color: "blue" } },
      seats: { alice: 1, bob: 2 },
    };

    const next = formReducer(state, { type: "TOGGLE_PLAYER", playerId: "alice" });

    expect(next.selected).toEqual(["bob"]);
    expect(next.variables).not.toHaveProperty("alice");
    expect(next.seats).not.toHaveProperty("alice");
    expect(next.variables.bob).toEqual({ color: "blue" });
    expect(next.seats.bob).toBe(2);
  });

  it("toggles multiple winners for ties and removes guest data cleanly", () => {
    let state = {
      ...buildInitialState({}),
      selected: ["alice"],
      guests: [{ id: "guest:bob-1", name: "Bob" }],
    };
    state = formReducer(state, { type: "TOGGLE_WINNER", playerId: "alice" });
    state = formReducer(state, { type: "TOGGLE_WINNER", playerId: "guest:bob-1" });
    expect(state.winnerIds).toEqual(["alice", "guest:bob-1"]);

    state = formReducer(state, { type: "REMOVE_GUEST", id: "guest:bob-1" });
    expect(state.guests).toEqual([]);
    expect(state.winnerIds).toEqual(["alice"]);
  });
});
