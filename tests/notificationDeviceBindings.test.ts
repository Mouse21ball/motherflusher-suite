import { describe, expect, it } from "vitest";
import {
  deleteOwnedDeviceBinding,
  registerDeviceBinding,
  revokeInstallationBinding,
  type DeviceBinding,
  type DeviceBindingRepository,
} from "../server/notificationDeviceBindings";

class MemoryDeviceBindings implements DeviceBindingRepository {
  readonly rows: DeviceBinding[] = [];

  async lockKeys(_keys: string[]): Promise<void> {}
  async lockPlayers(_playerIds: string[]): Promise<void> {}

  async ownersFor(token: string, installationId: string): Promise<string[]> {
    return this.rows
      .filter(row => (token && row.token === token) || row.installationId === installationId)
      .map(row => row.playerId);
  }

  async removeTokenOrInstallation(token: string, installationId: string): Promise<void> {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].token === token || this.rows[i].installationId === installationId) this.rows.splice(i, 1);
    }
  }

  async removeInstallation(installationId: string): Promise<boolean> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].installationId === installationId) this.rows.splice(i, 1);
    }
    return this.rows.length < before;
  }

  async removeOwned(playerId: string, token: string, installationId: string): Promise<void> {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i];
      if (row.playerId === playerId && row.token === token && row.installationId === installationId) {
        this.rows.splice(i, 1);
      }
    }
  }

  async insert(binding: DeviceBinding): Promise<void> {
    this.rows.push(binding);
  }
}

describe("push installation binding ownership", () => {
  it("rotates a token on the same installation across account switches without leaving the old owner", async () => {
    const repository = new MemoryDeviceBindings();
    repository.rows.push({
      token: "old-fcm-token",
      installationId: "install-1",
      playerId: "account-a",
      platform: "android",
    });

    await registerDeviceBinding(repository, "account-b", {
      token: "rotated-fcm-token",
      installationId: "install-1",
      platform: "ios",
    });

    expect(repository.rows).toEqual([{
      token: "rotated-fcm-token",
      installationId: "install-1",
      playerId: "account-b",
      platform: "ios",
    }]);
  });

  it("transfers a globally unique token from its previous installation and owner", async () => {
    const repository = new MemoryDeviceBindings();
    repository.rows.push({
      token: "shared-fcm-token",
      installationId: "install-a",
      playerId: "account-a",
      platform: "android",
    });

    await registerDeviceBinding(repository, "account-b", {
      token: "shared-fcm-token",
      installationId: "install-b",
      platform: "android",
    });

    expect(repository.rows).toEqual([{
      token: "shared-fcm-token",
      installationId: "install-b",
      playerId: "account-b",
      platform: "android",
    }]);
  });

  it("removes only the installation binding for explicit opt-out", async () => {
    const repository = new MemoryDeviceBindings();
    repository.rows.push(
      { token: "old-token", installationId: "install-1", playerId: "account-a", platform: "ios" },
      { token: "other-token", installationId: "install-2", playerId: "account-a", platform: "android" },
    );

    await registerDeviceBinding(repository, "account-b", {
      token: "new-token",
      installationId: "install-1",
      platform: "android",
      enabled: false,
    });

    expect(repository.rows).toEqual([
      { token: "other-token", installationId: "install-2", playerId: "account-a", platform: "android" },
    ]);
  });

  it("deletes a token only when both actor ownership and installation match", async () => {
    const repository = new MemoryDeviceBindings();
    repository.rows.push(
      { token: "owned-token", installationId: "install-1", playerId: "account-a", platform: "ios" },
      { token: "same-token", installationId: "install-2", playerId: "account-b", platform: "android" },
    );

    await deleteOwnedDeviceBinding(repository, "account-b", "owned-token", "install-1");
    expect(repository.rows).toHaveLength(2);
    await deleteOwnedDeviceBinding(repository, "account-a", "owned-token", "install-1");
    expect(repository.rows).toEqual([
      { token: "same-token", installationId: "install-2", playerId: "account-b", platform: "android" },
    ]);
  });

  it("revokes only the installation supplied to logout", async () => {
    const repository = new MemoryDeviceBindings();
    repository.rows.push(
      { token: "logout-token", installationId: "install-1", playerId: "account-a", platform: "ios" },
      { token: "keep-token", installationId: "install-2", playerId: "account-a", platform: "android" },
    );

    await revokeInstallationBinding(repository, "account-a", "install-1");
    expect(repository.rows).toEqual([
      { token: "keep-token", installationId: "install-2", playerId: "account-a", platform: "android" },
    ]);
  });
});