/**
 * Crews business logic — profanity filter, invite-code generation, rate limiter.
 * Heavy DB operations are delegated to storage.ts.
 */

import { storage } from "./storage";
import { filterChatMessage } from './chatFilter';

// ─── Invite-code generation ───────────────────────────────────────────────────
// 6 uppercase alphanumeric chars from an unambiguous alphabet (no 0/1/I/O).
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

// Guarantee uniqueness — try up to 10 times (collision probability ≈ 0).
export async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode();
    const existing = await storage.getCrewByInviteCode(code);
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique invite code — try again.");
}

// ─── Per-player chat rate limiter (in-memory, max 5 msg / 10 s) ──────────────
const rateLimitMap = new Map<string, number[]>(); // playerId → timestamps[]

export function checkChatRateLimit(playerId: string): boolean {
  const now    = Date.now();
  const window = 10_000; // ms
  const limit  = 5;

  const timestamps = (rateLimitMap.get(playerId) ?? []).filter(
    t => now - t < window
  );

  if (timestamps.length >= limit) return false; // blocked

  timestamps.push(now);
  rateLimitMap.set(playerId, timestamps);
  return true; // allowed
}

// ─── Crew name validation ─────────────────────────────────────────────────────

export function validateCrewName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 3)  return "Crew name must be at least 3 characters.";
  if (trimmed.length > 30) return "Crew name must be 30 characters or fewer.";
  const { hadProfanity } = filterChatMessage(trimmed);
  if (hadProfanity) return "Crew name contains a blocked word.";
  return null; // valid
}

// ─── Re-exports from storage (convenience) ───────────────────────────────────
export { storage };
