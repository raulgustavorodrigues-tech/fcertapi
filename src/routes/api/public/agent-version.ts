import { createFileRoute } from "@tanstack/react-router";

// Latest agent release advertised to running agents. When the agent's
// heartbeat carries `agent_version < AGENT_LATEST_VERSION`, it downloads
// `installer_url` and re-runs it silently (Inno Setup `/VERYSILENT`).
//
// Values can be overridden per environment via env vars so the hub can
// promote a new build without a redeploy.
const AGENT_LATEST_VERSION = "1.2.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/agent-version")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const version = process.env.AGENT_LATEST_VERSION ?? AGENT_LATEST_VERSION;
        const installer_url =
          process.env.AGENT_INSTALLER_URL ??
          "https://github.com/firesync/agent/releases/latest/download/firesync-agent-setup.exe";
        const changelog_url =
          process.env.AGENT_CHANGELOG_URL ??
          "https://github.com/firesync/agent/releases";
        // sha256 hex do .exe publicado. Configurar via env a cada release.
        // O agente pode validar o download antes de executar.
        const installer_sha256 = process.env.AGENT_INSTALLER_SHA256 ?? null;

        return Response.json(
          {
            version,
            installer_url,
            installer_sha256,
            changelog_url,
            min_supported_version: process.env.AGENT_MIN_SUPPORTED_VERSION ?? "1.0.0",
            // rollout gradual: se definido, só agentes com versão >= target_version aplicam
            target_version: process.env.AGENT_TARGET_VERSION ?? version,
            released_at: new Date().toISOString(),
          },
          { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
        );
      },
    },
  },
});
