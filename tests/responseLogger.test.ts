import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { describe, expect, it } from "vitest";
import { createApiResponseLogger } from "../server/responseLogger";

describe("API response logging redaction", () => {
  it("does not expose WebSocket ticket fields in the ws-ticket response log", async () => {
    const ticket = "one-time-ws-ticket-test-value";
    const responseBody = {
      ticket,
      nested: [{ wsTicket: ticket }],
    };
    const logLines: string[] = [];
    const app = express();
    app.use(createApiResponseLogger((line) => logLines.push(line)));
    app.get("/api/auth/ws-ticket", (_req, res) => res.json(responseBody));

    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/ws-ticket`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(responseBody);

      expect(logLines).toHaveLength(1);
      expect(logLines[0]).toContain("GET /api/auth/ws-ticket 200");
      expect(logLines[0]).toContain('"ticket":"[REDACTED]"');
      expect(logLines[0]).toContain('"wsTicket":"[REDACTED]"');
      expect(logLines[0]).not.toContain(ticket);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
