import { Capacitor } from '@capacitor/core';
import { apiUrl } from '@/lib/apiConfig';
import { apiFetch } from '@/lib/session';

export interface NotificationPreferences {
  streakAtRisk: boolean;
  hourlyReady: boolean;
  winBack: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  streakAtRisk: true,
  hourlyReady: true,
  winBack: true,
};

const DEVICE_STATE_KEY = 'cgp_push_device_state';
const LEGACY_DEVICE_TOKEN_KEY = 'cgp_push_device_token';
const INSTALLATION_ID_KEY = 'cgp_push_installation_id';

interface DeviceRef {
  token: string;
  platform: 'android' | 'ios';
}

interface DeviceAssociation extends DeviceRef {
  profileId: string;
}

interface DeviceState {
  registered: DeviceAssociation | null;
  desired: DeviceRef | null;
  orphaned: DeviceAssociation[];
}

const EMPTY_DEVICE_STATE: DeviceState = { registered: null, desired: null, orphaned: [] };
let cachedDeviceState: DeviceState | null = null;
let activeProfileId: string | null = null;
let activationGeneration = 0;
let firebaseListenerPromise: Promise<void> | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();

export function isNativePushPlatform(): boolean {
  return Capacitor.isNativePlatform() &&
    (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios');
}

function isDeviceRef(value: unknown): value is DeviceRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Partial<DeviceRef>;
  return typeof ref.token === 'string' && ref.token.length > 0 &&
    (ref.platform === 'android' || ref.platform === 'ios');
}

function readDeviceState(): DeviceState {
  if (cachedDeviceState) return cachedDeviceState;
  try {
    const value = localStorage.getItem(DEVICE_STATE_KEY);
    if (value) {
      const parsed = JSON.parse(value) as Partial<DeviceState>;
      const registered = parsed.registered as Partial<DeviceAssociation> | null | undefined;
      cachedDeviceState = {
        registered: registered && isDeviceRef(registered) &&
          typeof (registered as Partial<DeviceAssociation>).profileId === 'string'
          ? registered as DeviceAssociation
          : null,
        desired: isDeviceRef(parsed.desired) ? parsed.desired : null,
        orphaned: Array.isArray(parsed.orphaned)
          ? parsed.orphaned.filter((item): item is DeviceAssociation =>
              isDeviceRef(item) && typeof (item as DeviceAssociation).profileId === 'string')
          : [],
      };
      return cachedDeviceState;
    }

    // Migrate the previous single-token key without discarding a possible server
    // association. The owner is unknown, so a new authenticated POST will safely
    // transfer it and a logout will retain it for retry if DELETE fails.
    const legacyToken = localStorage.getItem(LEGACY_DEVICE_TOKEN_KEY);
    const platform = Capacitor.getPlatform();
    if (legacyToken && (platform === 'android' || platform === 'ios')) {
      cachedDeviceState = {
        ...EMPTY_DEVICE_STATE,
        registered: { token: legacyToken, platform, profileId: '__unknown__' },
      };
      writeDeviceState(cachedDeviceState);
      localStorage.removeItem(LEGACY_DEVICE_TOKEN_KEY);
      return cachedDeviceState;
    }
  } catch {}
  cachedDeviceState = { ...EMPTY_DEVICE_STATE, orphaned: [] };
  return cachedDeviceState;
}

function writeDeviceState(state: DeviceState): void {
  cachedDeviceState = state;
  try {
    localStorage.setItem(DEVICE_STATE_KEY, JSON.stringify(state));
    localStorage.removeItem(LEGACY_DEVICE_TOKEN_KEY);
  } catch {
    // Keep the in-memory retry state if persistent storage is unavailable.
  }
}

/** Stable per-install identity; unlike an FCM token, this survives token rotation. */
export function getPushInstallationId(): string {
  try {
    const stored = localStorage.getItem(INSTALLATION_ID_KEY);
    if (stored) return stored;
    const installationId = globalThis.crypto?.randomUUID?.();
    if (!installationId) throw new Error('Secure installation ID generation is unavailable.');
    localStorage.setItem(INSTALLATION_ID_KEY, installationId);
    return installationId;
  } catch (error) {
    if (error instanceof Error && error.message === 'Secure installation ID generation is unavailable.') throw error;
    throw new Error('Could not persist this device installation ID.');
  }
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function isCurrent(profileId: string, generation: number): boolean {
  return activeProfileId === profileId && activationGeneration === generation;
}

function assertResponseSucceeded(response: Response, message: string): void {
  if (!response.ok) throw new Error(message);
}

async function deleteDevice(ref: DeviceRef): Promise<void> {
  const response = await apiFetch(apiUrl('/api/notifications/devices'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ref.token, installationId: getPushInstallationId() }),
  });
  assertResponseSucceeded(response, 'Could not remove the push registration.');
}

async function postDevice(ref: DeviceRef, enabled: boolean): Promise<void> {
  const response = await apiFetch(apiUrl('/api/notifications/devices'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ref, installationId: getPushInstallationId(), enabled }),
  });
  assertResponseSucceeded(response, 'Could not register this device for push notifications.');
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await apiFetch(apiUrl('/api/notifications/preferences'));
  assertResponseSucceeded(response, 'Could not load notification preferences.');
  const data = await response.json() as { preferences?: Partial<NotificationPreferences> };
  return {
    streakAtRisk: data.preferences?.streakAtRisk ?? true,
    hourlyReady: data.preferences?.hourlyReady ?? true,
    winBack: data.preferences?.winBack ?? true,
  };
}

export async function saveNotificationPreferences(
  preferences: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const response = await apiFetch(apiUrl('/api/notifications/preferences'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  assertResponseSucceeded(response, 'Could not save notification preferences.');
  const data = await response.json() as { preferences?: Partial<NotificationPreferences> };
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...data.preferences,
    ...preferences,
  };
}

async function installFirebaseListener(): Promise<void> {
  if (firebaseListenerPromise) return firebaseListenerPromise;
  firebaseListenerPromise = (async () => {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.addListener('tokenReceived', event => {
      const platform = Capacitor.getPlatform();
      if (!activeProfileId || (platform !== 'android' && platform !== 'ios')) return;
      const profileId = activeProfileId;
      const generation = activationGeneration;
      void (async () => {
        const preferences = await fetchNotificationPreferences();
        if (!isCurrent(profileId, generation)) return;
        const enabled = preferences.streakAtRisk || preferences.hourlyReady || preferences.winBack;
        if (!enabled || await checkNativePushPermission() !== 'granted') {
          await revokeInstallationForProfile(profileId, generation);
          return;
        }
        await synchronizeDeviceToken({ token: event.token, platform }, profileId, generation);
      })().catch(() => { /* Retained local state will retry on the next activation. */ });
    });
  })().catch(error => {
    firebaseListenerPromise = null;
    throw error;
  });
  return firebaseListenerPromise;
}

async function synchronizeDeviceToken(
  ref: DeviceRef,
  profileId: string,
  generation: number,
): Promise<void> {
  await serialize(async () => {
    if (!isCurrent(profileId, generation)) return;
    const preferences = await fetchNotificationPreferences();
    if (!isCurrent(profileId, generation)) return;
    if (!preferences.streakAtRisk && !preferences.hourlyReady && !preferences.winBack) {
      await revokeInstallationInQueue(profileId, generation);
      return;
    }
    let state = readDeviceState();
    if (state.registered?.profileId === '__unknown__') {
      state = { ...state, registered: { ...state.registered, profileId } };
    }
    state = { ...state, desired: ref };
    writeDeviceState(state);

    const current = state.registered;
    if (current && current.token !== ref.token && current.profileId === profileId) {
      // Do not replace the saved reference until the old association is known
      // detached; failed deletes stay retryable and block a potentially unsafe
      // second registration.
      await deleteDevice(current);
      state = { ...state, registered: null };
      writeDeviceState(state);
    } else if (current && current.token !== ref.token && current.profileId !== profileId) {
      // The current session cannot detach another account's association. Preserve
      // it for that account's next session while registering the new FCM token.
      state = {
        ...state,
        registered: null,
        orphaned: [...state.orphaned.filter(item => item.token !== current.token), current],
      };
      writeDeviceState(state);
    }

    if (!isCurrent(profileId, generation)) return;
    await postDevice(ref, true);
    state = readDeviceState();
    state = {
      ...state,
      registered: { ...ref, profileId },
      desired: null,
      // A successful POST is an atomic server-side transfer for this token.
      orphaned: state.orphaned.filter(item => item.token !== ref.token),
    };
    writeDeviceState(state);
  });
}

async function getAnyDeviceRef(state: DeviceState): Promise<DeviceRef> {
  const existing = state.registered ?? state.desired ?? state.orphaned[0];
  if (existing) return { token: existing.token, platform: existing.platform };
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error('Push is available only in the native app.');
  }
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const result = await FirebaseMessaging.getToken();
  return { token: result.token, platform };
}

/** Installation-wide revocation also removes tokens left by any prior account. */
async function revokeInstallationForProfile(
  profileId: string,
  generation: number,
): Promise<void> {
  await serialize(async () => {
    await revokeInstallationInQueue(profileId, generation);
  });
}

async function revokeInstallationInQueue(
  profileId: string,
  generation: number,
): Promise<void> {
  if (!isCurrent(profileId, generation)) return;
  const state = readDeviceState();
  const ref = await getAnyDeviceRef(state);
  if (!isCurrent(profileId, generation)) return;
  await postDevice(ref, false);
  if (!isCurrent(profileId, generation)) return;
  writeDeviceState({ ...EMPTY_DEVICE_STATE, orphaned: [] });
}

async function retryOrphanedDetaches(profileId: string, generation: number): Promise<void> {
  await serialize(async () => {
    if (!isCurrent(profileId, generation)) return;
    let state = readDeviceState();
    for (const ref of state.orphaned.filter(item => item.profileId === profileId)) {
      if (!isCurrent(profileId, generation)) return;
      await deleteDevice(ref);
      state = readDeviceState();
      state = {
        ...state,
        orphaned: state.orphaned.filter(item =>
          item.profileId !== profileId || item.token !== ref.token),
      };
      writeDeviceState(state);
    }
  });
}

export async function checkNativePushPermission(): Promise<string> {
  if (!isNativePushPlatform()) return 'unavailable';
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const result = await FirebaseMessaging.checkPermissions();
  return result.receive;
}

export async function requestNativePushPermission(): Promise<string> {
  if (!isNativePushPlatform()) return 'unavailable';
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  let result = await FirebaseMessaging.checkPermissions();
  if (result.receive !== 'granted') result = await FirebaseMessaging.requestPermissions();
  return result.receive;
}

export async function activatePushForProfile(profileId: string | null): Promise<void> {
  if (activeProfileId !== profileId) {
    activeProfileId = profileId;
    activationGeneration += 1;
  }
  const generation = activationGeneration;
  if (!profileId || !isNativePushPlatform()) return;

  await installFirebaseListener();
  const preferences = await fetchNotificationPreferences();
  if (!isCurrent(profileId, generation)) return;
  const savedState = readDeviceState();
  if (savedState.registered?.profileId === '__unknown__') {
    writeDeviceState({
      ...savedState,
      registered: { ...savedState.registered, profileId },
    });
  }
  const enabled = preferences.streakAtRisk || preferences.hourlyReady || preferences.winBack;
  if (!enabled) {
    await revokeInstallationForProfile(profileId, generation);
    return;
  }

  if (await checkNativePushPermission() !== 'granted') {
    if (isCurrent(profileId, generation)) await revokeInstallationForProfile(profileId, generation);
    return;
  }
  if (!isCurrent(profileId, generation)) return;
  await retryOrphanedDetaches(profileId, generation);
  if (!isCurrent(profileId, generation)) return;
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const result = await FirebaseMessaging.getToken();
  if (!isCurrent(profileId, generation)) return;
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return;
  await synchronizeDeviceToken({ token: result.token, platform }, profileId, generation);
}

export function deactivatePushForProfile(profileId: string): void {
  if (activeProfileId !== profileId) return;
  activeProfileId = null;
  activationGeneration += 1;
}

/** Revoke a device installation before deleting its owning account. */
export async function revokePushInstallation(profileId: string): Promise<void> {
  if (!isNativePushPlatform()) return;
  if (activeProfileId !== profileId) {
    activeProfileId = profileId;
    activationGeneration += 1;
  }
  await revokeInstallationForProfile(profileId, activationGeneration);
}

/** The server atomically revokes this installation and session; failed logout keeps auth intact. */
export async function logoutPushInstallation(profileIdOverride?: string): Promise<void> {
  const profileId = profileIdOverride ?? activeProfileId;
  activeProfileId = null;
  activationGeneration += 1;
  const generation = activationGeneration;
  try {
    await serialize(async () => {
      if (activeProfileId !== null || activationGeneration !== generation) {
        throw new Error('Logout was interrupted.');
      }
      const response = await apiFetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId: getPushInstallationId() }),
      });
      assertResponseSucceeded(response, 'Could not log out. Check your connection and try again.');
      writeDeviceState({ ...EMPTY_DEVICE_STATE, orphaned: [] });
    });
  } catch {
    // Fence stale work during the attempt, then restore the active account and
    // retain all token references so a failed revocation cannot be forgotten.
    if (activeProfileId === null && activationGeneration === generation && profileId) {
      activeProfileId = profileId;
      activationGeneration += 1;
      void activatePushForProfile(profileId).catch(() => {});
    }
    throw new Error('Could not log out or revoke this device. Check your connection and try again.');
  }
}