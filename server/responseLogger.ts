import type { RequestHandler } from "express";

// Redacts known-sensitive keys from a response body before it reaches the log.
// Deep-clones the object so the actual HTTP response is never altered.
const REDACTED_KEYS = new Set([
  "sessionToken", "token", "password", "passwordHash", "hashedPassword",
  "resetToken", "passwordResetToken", "purchaseToken", "refreshToken",
  "accessToken", "idToken", "ticket", "googlePlayServiceAccount",
  "serviceAccountKey", "error", "message", "details", "reason",
]);
const SENSITIVE_KEY_PATTERN =
  /password|token|ticket|secret|private[_\-]?key|error|message|detail|reason/i;

function shouldRedactKey(key: string): boolean {
  return REDACTED_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key);
}

function redactSensitive(value: any): any {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, any> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    out[key] = shouldRedactKey(key) ? "[REDACTED]" : redactSensitive(nestedValue);
  }
  return out;
}

export function createApiResponseLogger(log: (message: string) => void): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: any = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          const safe = redactSensitive(capturedJsonResponse);
          logLine += ` :: ${JSON.stringify(safe)}`;
        }

        log(logLine);
      }
    });

    next();
  };
}
