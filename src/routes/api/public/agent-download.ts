// GET /api/public/agent-download?token=<agent_token>&database_id=<id>
//
// Proxy autenticado do firesync-agent-setup.exe. O install.bat baixa DAQUI
// (domínio do Hub, que a rede do cliente libera) em vez do GitHub direto.
// O servidor (Cloudflare) busca do GitHub e faz streaming ao agente.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_INSTALLER_URL =
  "https://github.com/raulgustavorodrigues-tech/fcertapi/releases/latest/download/firesync-agent-setup.exe";

function err(status: number, msg: string) {
  return new Response(msg, { status, headers: { ...CORS, "Content-Type": "text/plain" } });
}

export const Route = createFileRoute("/api/public/agent-download")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const dbId = url.searchParams.get("database_id");
        if (!token) return err(400, "token é obrigatório");

        let query = supabaseAdmin.from("databases").select("id, agent_token").eq("agent_token", token);
        if (dbId) query = query.eq("id", dbId);
        const { data: db } = await query.maybeSingle();
        if (!db) return err(401, "token inválido");

        const installerUrl = process.env.AGENT_INSTALLER_URL || DEFAULT_INSTALLER_URL;

        const upstream = await fetch(installerUrl, { redirect: "follow" });
        if (!upstream.ok || !upstream.body) {
          return err(502, `Falha ao obter o instalador do GitHub (HTTP ${upstream.status})`);
        }

        const headers: Record<string, string> = {
          ...CORS,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="firesync-agent-setup.exe"',
          "Cache-Control": "no-store",
        };
        const len = upstream.headers.get("content-length");
        if (len) headers["Content-Length"] = len;

        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
