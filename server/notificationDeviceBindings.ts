export interface DeviceBinding {
  token: string;
  installationId: string;
  playerId: string;
  platform: "android" | "ios";
}

export interface DeviceBindingRepository {
  lockKeys(keys: string[]): Promise<void>;
  ownersFor(token: string, installationId: string): Promise<string[]>;
  lockPlayers(playerIds: string[]): Promise<void>;
  removeTokenOrInstallation(token: string, installationId: string): Promise<void>;
  removeInstallation(installationId: string): Promise<boolean>;
  removeOwned(playerId: string, token: string, installationId: string): Promise<void>;
  insert(binding: DeviceBinding): Promise<void>;
}

export async function registerDeviceBinding(
  repository: DeviceBindingRepository,
  actorId: string,
  binding: Omit<DeviceBinding, "playerId"> & { enabled?: boolean },
  isSessionStillValid?: () => Promise<boolean>,
): Promise<"registered" | "removed" | "unauthorized"> {
  const keys = binding.enabled === false
    ? [`installation:${binding.installationId}`]
    : [`installation:${binding.installationId}`, `token:${binding.token}`];
  await repository.lockKeys(keys);
  if (isSessionStillValid && !await isSessionStillValid()) return "unauthorized";
  const existingOwners = await repository.ownersFor(binding.token, binding.installationId);
  await repository.lockPlayers([...existingOwners, actorId]);

  if (binding.enabled === false) {
    await repository.removeInstallation(binding.installationId);
    return "removed";
  }
  await repository.removeTokenOrInstallation(binding.token, binding.installationId);
  await repository.insert({
    token: binding.token,
    installationId: binding.installationId,
    platform: binding.platform,
    playerId: actorId,
  });
  return "registered";
}

export async function deleteOwnedDeviceBinding(
  repository: DeviceBindingRepository,
  actorId: string,
  token: string,
  installationId: string,
): Promise<void> {
  await repository.lockKeys([`installation:${installationId}`, `token:${token}`]);
  const owners = await repository.ownersFor(token, installationId);
  await repository.lockPlayers([...owners, actorId]);
  await repository.removeOwned(actorId, token, installationId);
}

export async function revokeInstallationBinding(
  repository: DeviceBindingRepository,
  actorId: string,
  installationId: string,
): Promise<boolean> {
  await repository.lockKeys([`installation:${installationId}`]);
  const owners = await repository.ownersFor("", installationId);
  await repository.lockPlayers([...owners, actorId]);
  return repository.removeInstallation(installationId);
}