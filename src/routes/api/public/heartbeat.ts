import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FireSync-Signature",
};

function err(status: number, code: string, message: string, details?: unknown) {
  return Response.json(
    { success: false, error: { code, message, details } },
    { status, headers: CORS },
  );
}

const heartbeatSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  agent_version: z.string().max(64).optional(),
  timestamp: z.string().optional(),
  tunnel_url: z.string().url().nullable().optional(),
  system_info: z
    .object({
      cpu_percent: z.number().optional(),
      memory_percent: z.number().optional(),
      db_reachable: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
}).strict();

export const Route = createFileRoute("/api/public/heartbeat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Authorization Bearer ausente");

        const raw = await request.text();
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return err(400, "INVALID_JSON", "Body não é JSON válido"); }

        const parsed = heartbeatSchema.safeParse(body);
        if (!parsed.success) {
          return err(422, "VALIDATION_ERROR", "Payload inválido",
            parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })));
        }
        const data = parsed.data;

        const { data: db } = await supabaseAdmin
          .from("databases")
          .select("id, agent_token")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        if (!db) return err(404, "AGENT_NOT_FOUND", `agent_uid "${data.agent_uid}" não registrado`);
        if (!db.agent_token || db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido");

        const sig = verifyAgentSignature(request, raw, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

        const now = new Date().toISOString();

        const { data: existing } = await supabaseAdmin
          .from("agents")
          .select("id, pending_commands, heartbeat_interval_seconds")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        const update = {
          last_heartbeat_at: now,
          status: "online",
          agent_version: data.agent_version ?? null,
          tunnel_url: data.tunnel_url ?? null,
          push_only: !data.tunnel_url,
          system_info: (data.system_info ?? null) as any,
        };

        let pending: any[] = [];
        let interval = 30;

        if (existing) {
          await supabaseAdmin.from("agents").update(update).eq("id", existing.id);
          pending = Array.isArray(existing.pending_commands) ? existing.pending_commands : [];
          interval = existing.heartbeat_interval_seconds ?? 30;

          // mark commands as picked_up
          if (pending.length > 0) {
            const ids = pending.map((c: any) => c.command_id).filter(Boolean);
            if (ids.length > 0) {
              await supabaseAdmin
                .from("command_results")
                .update({ status: "processing", picked_up_at: now })
                .in("command_id", ids)
                .eq("status", "pending");
            }
          }
        } else {
          await supabaseAdmin.from("agents").insert({
            ...update,
            agent_uid: data.agent_uid,
            database_id: db.id,
            alias: data.agent_uid,
            first_seen_at: now,
          });
        }

        return Response.json(
          {
            status: "ok",
            server_time: now,
            pending_commands: pending,
            next_heartbeat_in: interval,
          },
          { headers: CORS },
        );
      },
    },
  },
});
