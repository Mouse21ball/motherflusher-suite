export const BUILD_COMMIT =
  import.meta.env.VITE_BUILD_COMMIT || "unknown";

export const BUILD_TIMESTAMP =
  import.meta.env.VITE_BUILD_TIMESTAMP || "unknown";

declare const __APP_RELEASE_INFO__: Record<
  "ios" | "android" | "web", { version: string; build: number }
>;
export const APP_RELEASE_INFO = __APP_RELEASE_INFO__;