import { readFileSync } from "fs";
import { resolve } from "path";
import * as https from "https";
import * as querystring from "querystring";

// Load .env before NestJS bootstraps
function loadDotEnv() {
  try {
    const envPath = resolve(__dirname, "../.env");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const idx = t.indexOf("=");
      if (idx < 1) continue;
      const key = t.slice(0, idx).trim();
      const val = t
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, ""); // strip surrounding quotes if present
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // no .env — env vars set externally
  }
}
loadDotEnv();

// ── Auto-refresh Trimble client-credentials token ─────────────────────────
// Uses CLIENT_ID + CLIENT_SECRET (client_credentials grant, scope=agents)
// to get a machine token that works with the Agent Service API.
// Refreshes every 45 minutes so the server never runs with an expired token.

function fetchMachineToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = process.env.CLIENT_ID ?? "";
    const clientSecret = process.env.CLIENT_SECRET ?? "";
    if (!clientId || !clientSecret) {
      reject(new Error("CLIENT_ID or CLIENT_SECRET not set"));
      return;
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = querystring.stringify({ grant_type: "client_credentials", scope: "agents" });

    const options: https.RequestOptions = {
      hostname: "id.trimble.com",
      path: "/oauth/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data) as { access_token?: string; error?: string };
          if (json.access_token) {
            resolve(json.access_token);
          } else {
            reject(new Error(json.error ?? "No access_token in response"));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function refreshToken(log = true): Promise<void> {
  try {
    const token = await fetchMachineToken();
    process.env.TRIMBLE_AGENT_API_KEY = token;
    if (log) {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split(".")[1], "base64").toString()
        ) as { exp?: number; scope?: string };
        const exp = payload.exp ? new Date(payload.exp * 1000).toISOString() : "unknown";
        console.log(`Trimble machine token refreshed — scope: ${payload.scope} | expires: ${exp}`);
      } catch {
        console.log("Trimble machine token refreshed (opaque)");
      }
    }
  } catch (err) {
    // If CLIENT_ID/SECRET not set or network error, fall through to the manual key in .env
    if (log && process.env.TRIMBLE_AGENT_API_KEY) {
      console.log("Token auto-refresh skipped — using TRIMBLE_AGENT_API_KEY from .env");
    } else if (log) {
      console.warn(`Token auto-refresh failed: ${(err as Error).message}`);
    }
  }
}

import { NestFactory } from "@nestjs/core";
import { RequestMethod } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Only auto-refresh with machine token if the .env key is missing or already expired.
  // If a valid user JWT is in .env, keep it — the machine token would downgrade permissions.
  const existingKey = process.env.TRIMBLE_AGENT_API_KEY;
  let existingIsValid = false;
  if (existingKey) {
    try {
      const p = JSON.parse(Buffer.from(existingKey.split(".")[1], "base64").toString()) as { exp?: number };
      existingIsValid = Boolean(p.exp && p.exp * 1000 > Date.now());
    } catch { /* not a JWT */ }
  }

  if (!existingIsValid) {
    // No valid key in .env — fetch machine token
    await refreshToken();
  } else {
    console.log("Using existing token from .env (still valid — skipping machine token refresh)");
  }

  // Schedule background refresh every 45 min — only replaces if current key has expired
  setInterval(() => {
    const key = process.env.TRIMBLE_AGENT_API_KEY;
    let stillValid = false;
    if (key) {
      try {
        const p = JSON.parse(Buffer.from(key.split(".")[1], "base64").toString()) as { exp?: number };
        stillValid = Boolean(p.exp && p.exp * 1000 > Date.now() + 5 * 60 * 1000); // 5-min buffer
      } catch { /* not a JWT */ }
    }
    if (!stillValid) void refreshToken(false);
  }, 5 * 60 * 1000); // check every 5 min

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api", {
    exclude: [{ path: "mcp", method: RequestMethod.POST }],
  });

  // CORS: allow local dev + any configured production origin
  const corsOrigins: (string | RegExp)[] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  if (process.env.BFF_PUBLIC_URL) {
    corsOrigins.push(process.env.BFF_PUBLIC_URL.replace(/\/$/, ""));
  }
  // Allow Azure Static Web Apps origin pattern
  corsOrigins.push(/\.azurestaticapps\.net$/);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`API http://localhost:${port}/api`);
  console.log(`MCP http://localhost:${port}/mcp`);
  console.log(`Trimble agent base : ${process.env.TRIMBLE_AGENT_BASE_URL ?? "(not set)"}`);
  console.log(`Trimble agent key  : ${process.env.TRIMBLE_AGENT_API_KEY ? "✓ set" : "✗ not set"}`);
}

bootstrap();
