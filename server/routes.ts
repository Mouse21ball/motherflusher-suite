import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";

const trackEventSchema = z.object({
  eventType: z.enum(["session_start", "session_end", "mode_play"]),
  playerId: z.string().min(1),
  mode: z.string().optional(),
  durationMs: z.number().int().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/analytics/track", async (req, res) => {
    try {
      const parsed = trackEventSchema.parse(req.body);
      const eventDate = new Date().toISOString().split("T")[0];
      await storage.insertAnalyticsEvent({
        eventType: parsed.eventType,
        playerId: parsed.playerId,
        mode: parsed.mode ?? null,
        durationMs: parsed.durationMs ?? null,
        eventDate,
      });
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: "Invalid event data" });
    }
  });

  app.get("/api/analytics/stats", async (_req, res) => {
    try {
      const stats = await storage.getDailyStats(30);
      res.json(stats);
    } catch (err) {
      console.error("Analytics stats error:", err);
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  return httpServer;
}
