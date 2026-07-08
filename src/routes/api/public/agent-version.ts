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

        return Response.json(
          {
            version,
            installer_url,
            changelog_url,
            min_supported_version: "1.0.0",
            released_at: new Date().toISOString(),
          },
          { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
        );
      },
    },
  },
});
