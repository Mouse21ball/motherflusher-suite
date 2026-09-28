import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { playerProfiles } from "../shared/schema";

describe.skipIf(!process.env.DATABASE_URL)("friend request and recent player storage", () => {
  const runId = randomUUID();
  const playerIds = Array.from({ length: 25 }, (_, index) => `friend-test-${runId}-${index}`);
  const [alice, bob, charlie] = playerIds;

  beforeAll(async () => {
    await db.insert(playerProfiles).values(playerIds.map((id, index) => ({
      id,
      displayName: `Friend test ${index}`,
    })));
  });

  afterAll(async () => {
    await db.delete(playerProfiles).where(inArray(playerProfiles.id, playerIds));
  });

  it("sends, accepts, declines, and rejects unauthorized/self/blocked requests", async () => {
    const incoming = await storage.sendFriendRequest(alice, bob);
    expect(incoming.status).toBe("pending");
    expect(await storage.sendFriendRequest(alice, bob)).toEqual(incoming);
    await expect(storage.respondToFriendRequest(alice, incoming.id, "accepted")).rejects.toMatchObject({ code: "not_found" });
    await expect(storage.sendFriendRequest(alice, alice)).rejects.toMatchObject({ code: "invalid_recipient" });
    expect(await storage.respondToFriendRequest(bob, incoming.id, "accepted")).toEqual({ id: incoming.id, status: "accepted" });

    const declined = await storage.sendFriendRequest(alice, charlie);
    expect(await storage.respondToFriendRequest(charlie, declined.id, "declined")).toEqual({ id: declined.id, status: "declined" });
    await storage.sendFriendRequest(alice, playerIds[4]);

    await storage.blockPlayer(alice, playerIds[3]);
    await expect(storage.sendFriendRequest(alice, playerIds[3])).rejects.toMatchObject({ code: "blocked" });
    await expect(storage.sendFriendRequest(alice, `bot_${runId}`)).rejects.toMatchObject({ code: "bot_recipient" });

    const lists = await storage.getFriendRequests(alice);
    expect(lists.friends.map(friend => friend.id)).toContain(bob);
    expect(lists.sent.map(request => request.player.id)).toContain(playerIds[4]);
    expect(lists.sent.map(request => request.player.id)).not.toContain(charlie);

    await storage.recordRecentCoSeatedPlayers([alice, bob]);
    expect((await storage.getFriendRequests(alice)).recent.map(row => row.player.id)).toContain(bob);

    await storage.blockPlayer(alice, bob);
    for (const viewerId of [alice, bob]) {
      const hidden = await storage.getFriendRequests(viewerId);
      expect(hidden.friends.map(friend => friend.id)).not.toContain(viewerId === alice ? bob : alice);
      expect(hidden.recent.map(row => row.player.id)).not.toContain(viewerId === alice ? bob : alice);
    }
    await storage.unblockPlayer(alice, bob);
    expect((await storage.getFriendRequests(alice)).friends.map(friend => friend.id)).toContain(bob);
    expect((await storage.getFriendRequests(bob)).friends.map(friend => friend.id)).toContain(alice);
    expect((await storage.getFriendRequests(alice)).recent.map(row => row.player.id)).toContain(bob);

    // A reverse-direction block has exactly the same visibility semantics.
    await storage.blockPlayer(bob, alice);
    expect((await storage.getFriendRequests(alice)).friends.map(friend => friend.id)).not.toContain(bob);
    expect((await storage.getFriendRequests(bob)).friends.map(friend => friend.id)).not.toContain(alice);
    await storage.unblockPlayer(bob, alice);

    const pendingTarget = playerIds[5];
    await storage.sendFriendRequest(alice, pendingTarget);
    expect((await storage.getFriendRequests(pendingTarget)).received.map(row => row.player.id)).toContain(alice);
    await storage.blockPlayer(pendingTarget, alice);
    expect((await storage.getFriendRequests(alice)).sent.map(row => row.player.id)).not.toContain(pendingTarget);
    expect((await storage.getFriendRequests(pendingTarget)).received.map(row => row.player.id)).not.toContain(alice);
    await storage.unblockPlayer(pendingTarget, alice);
    expect((await storage.getFriendRequests(pendingTarget)).received.map(row => row.player.id)).toContain(alice);

    const retried = await storage.sendFriendRequest(alice, charlie);
    expect(retried).toEqual({ id: declined.id, status: "pending" });
    expect(await storage.respondToFriendRequest(charlie, retried.id, "declined")).toEqual({ id: declined.id, status: "declined" });
  });

  it("stores both co-seated directions and returns distinct recent players, capped at 20", async () => {
    const seated = playerIds.slice(2, 25);
    await storage.recordRecentCoSeatedPlayers([alice, ...seated]);
    await storage.recordRecentCoSeatedPlayers([alice, seated[0], seated[1]]);
    const recent = await storage.getFriendRequests(alice);
    expect(recent.recent).toHaveLength(20);
    expect(new Set(recent.recent.map(row => row.player.id)).size).toBe(20);
    const reverse = await storage.getFriendRequests(seated[0]);
    expect(reverse.recent.some(row => row.player.id === alice)).toBe(true);
  });
});
