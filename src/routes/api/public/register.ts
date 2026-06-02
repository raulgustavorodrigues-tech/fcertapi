import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function err(status: number, code: string, message: string) {
  return Response.json({ success: false, error: { code, message } }, { status, headers: CORS });
}

const registerSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  agent_version: z.string().max(64).optional(),
  alias: z.string().max(255).optional(),
  hostname: z.string().max(255).optional(),
  ip_address: z.string().max(64).optional(),
}).strict();

function genToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "fsh_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return err(400, "INVALID_JSON", "Body inválido"); }
        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) return err(422, "VALIDATION_ERROR", "Payload inválido");
        const data = parsed.data;

        // Find the corresponding database; create token if needed
        const { data: db } = await supabaseAdmin
          .from("databases")
          .select("id, agent_token, sync_interval, sync_tables, name")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        if (!db) return err(404, "AGENT_NOT_FOUND", "agent_uid não está cadastrado em nenhum banco");

        let token = db.agent_token;
        if (!token) {
          token = genToken();
          await supabaseAdmin.from("databases").update({ agent_token: token }).eq("id", db.id);
          await supabaseAdmin.from("agent_token_history").insert({
            database_id: db.id,
            token,
          });
        }

        const now = new Date().toISOString();

        const { data: existing } = await supabaseAdmin
          .from("agents")
          .select("id")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        if (existing) {
          await supabaseAdmin.from("agents").update({
            alias: data.alias ?? data.agent_uid,
            agent_version: data.agent_version ?? null,
            ip_address: data.ip_address ?? null,
            status: "online",
            last_heartbeat_at: now,
          }).eq("id", existing.id);
        } else {
          await supabaseAdmin.from("agents").insert({
            agent_uid: data.agent_uid,
            alias: data.alias ?? data.agent_uid,
            agent_version: data.agent_version ?? null,
            ip_address: data.ip_address ?? null,
            database_id: db.id,
            status: "online",
            last_heartbeat_at: now,
          });
        }

        return Response.json({
          success: true,
          agent_token: token,
          config: {
            heartbeat_interval_seconds: 30,
            sync_interval_seconds: db.sync_interval ?? 900,
            sync_tables: db.sync_tables ?? "ALL",
          },
        }, { headers: CORS });
      },
    },
  },
});
