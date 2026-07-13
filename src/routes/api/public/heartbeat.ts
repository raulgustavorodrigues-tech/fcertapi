import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

// CORREÇÃO C3/C4: a fonte da verdade da fila é command_results.
// - pendentes são buscados por database_id e marcados 'processing'
// - 'processing' sem resposta há >3 min é re-entregue (agente v1.3 deduplica)
// - comandos com >15 min sem conclusão expiram como 'timeout'

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
  queue_depth: z.number().int().min(0).optional(),
  system_info: z
    .object({
      cpu_percent: z.number().optional(),
      memory_percent: z.number().optional(),
      db_reachable: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
}).strict();

const PICKUP_LIMIT = 10;
const REDELIVERY_AFTER_MS = 3 * 60 * 1000;
const EXPIRE_AFTER_MS = 15 * 60 * 1000;

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
          .select("id, agent_token, sync_tables, sync_interval")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        if (!db) return err(404, "AGENT_NOT_FOUND", `agent_uid "${data.agent_uid}" não registrado`);
        if (!db.agent_token || db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido");

        const sig = verifyAgentSignature(request, raw, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

        const now = new Date().toISOString();

        const { data: existing } = await supabaseAdmin
          .from("agents")
          .select("id, heartbeat_interval_seconds")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        const mergedSystemInfo = {
          ...(data.system_info ?? {}),
          ...(typeof data.queue_depth === "number" ? { queue_depth: data.queue_depth } : {}),
        };

        const update = {
          last_heartbeat_at: now,
          status: "online",
          agent_version: data.agent_version ?? null,
          tunnel_url: data.tunnel_url ?? null,
          push_only: !data.tunnel_url,
          system_info: (Object.keys(mergedSystemInfo).length ? mergedSystemInfo : null) as any,
        };

        let interval = 30;
        if (existing) {
          await supabaseAdmin.from("agents").update(update).eq("id", existing.id);
          interval = existing.heartbeat_interval_seconds ?? 30;
        } else {
          await supabaseAdmin.from("agents").insert({
            ...update,
            agent_uid: data.agent_uid,
            database_id: db.id,
            alias: data.agent_uid,
            first_seen_at: now,
          });
        }

        // 1) Expira comandos abandonados (>15 min)
        const expireBefore = new Date(Date.now() - EXPIRE_AFTER_MS).toISOString();
        await supabaseAdmin
          .from("command_results")
          .update({
            status: "timeout",
            error_message: "Comando expirado: agente não concluiu dentro de 15 minutos",
            completed_at: now,
          })
          .eq("database_id", db.id)
          .in("status", ["pending", "processing"])
          .lt("enqueued_at", expireBefore);

        // 2) Busca pendentes + 'processing' órfãos (duas queries separadas
        //    para evitar armadilhas do or= do PostgREST com timestamps)
        const redeliverBefore = new Date(Date.now() - REDELIVERY_AFTER_MS).toISOString();

        const { data: pendingRows } = await supabaseAdmin
          .from("command_results")
          .select("command_id, command_type, payload, enqueued_at")
          .eq("database_id", db.id)
          .eq("status", "pending")
          .order("enqueued_at", { ascending: true })
          .limit(PICKUP_LIMIT);

        let rows = pendingRows ?? [];

        if (rows.length < PICKUP_LIMIT) {
          const { data: staleRows } = await supabaseAdmin
            .from("command_results")
            .select("command_id, command_type, payload, enqueued_at")
            .eq("database_id", db.id)
            .eq("status", "processing")
            .lt("picked_up_at", redeliverBefore)
            .order("enqueued_at", { ascending: true })
            .limit(PICKUP_LIMIT - rows.length);
          rows = rows.concat(staleRows ?? []);
        }

        // Formato compatível com agentes antigos (type) e novos (command_type)
        const pending = rows.map((r) => ({
          command_id: r.command_id,
          command_type: r.command_type,
          type: r.command_type,
          payload: (r.payload ?? {}) as Record<string, unknown>,
          enqueued_at: r.enqueued_at,
        }));

        // 3) Marca entregues como 'processing'
        if (pending.length > 0) {
          await supabaseAdmin
            .from("command_results")
            .update({ status: "processing", picked_up_at: now })
            .in("command_id", pending.map((p) => p.command_id));
        }

        return Response.json(
          {
            status: "ok",
            server_time: now,
            pending_commands: pending,
            next_heartbeat_in: interval,
            // Config dinâmica: o agente v1.4+ aplica sem reinstalar
            config: {
              sync_tables: (db as any).sync_tables ?? "ALL",
              sync_interval: (db as any).sync_interval ?? null,
            },
          },
          { headers: CORS },
        );
      },
    },
  },
});
