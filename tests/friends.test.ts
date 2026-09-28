import { describe, expect, it } from "vitest";
import { isFriendTableJoinable } from "../server/routes";

describe("friend table joinability", () => {
  const publicTable = { isInviteOnly: false, maxPlayers: 5 };

  it("allows only public tables with an available human seat", () => {
    expect(isFriendTableJoinable(publicTable, 4, false)).toBe(true);
    expect(isFriendTableJoinable(publicTable, 5, false)).toBe(false);
    expect(isFriendTableJoinable({ ...publicTable, isInviteOnly: true }, 2, false)).toBe(false);
  });

  it("requires actual membership before exposing a club-table join target", () => {
    const clubTable = { ...publicTable, crewId: "private-club-id" };
    expect(isFriendTableJoinable(clubTable, 2, false)).toBe(false);
    expect(isFriendTableJoinable(clubTable, 2, true)).toBe(true);
    expect(isFriendTableJoinable(clubTable, 5, true)).toBe(false);
  });
});
