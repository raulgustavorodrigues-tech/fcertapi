import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

// Consolidated endpoint: replaces /api/public/logs + /api/public/command_result.
// Accepts a single report from the agent containing any combination of:
//  - logs[]        → written to agent_logs
//  - results[]     → written to command_results + removed from agents.pending_commands
// The old endpoints remain available as thin wrappers for backwards compatibility.

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

const logEntry = z.object({
  level: z.enum(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1).max(4000),
  context: z.record(z.any()).optional(),
  timestamp: z.string().optional(),
});

const resultEntry = z.object({
  command_id: z.string().min(1).max(128),
  command_type: z.string().min(1).max(64),
  status: z.enum(["success", "error"]),
  result: z.any().optional(),
  error_message: z.string().max(2000).optional(),
  duration_ms: z.number().int().min(0).optional(),
  completed_at: z.string().optional(),
});

const payloadSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  logs: z.array(logEntry).max(500).optional(),
  results: z.array(resultEntry).max(100).optional(),
}).strict();

export const Route = createFileRoute("/api/public/agent-report")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Authorization Bearer ausente");

        let body: unknown;
        const raw = await request.text();
        try { body = JSON.parse(raw); } catch { return err(400, "INVALID_JSON", "Body inválido"); }

        const parsed = payloadSchema.safeParse(body);
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
        if (!db) return err(404, "AGENT_NOT_FOUND", "agent_uid não registrado");
        if (db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido");

        const sig = verifyAgentSignature(request, raw, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id, pending_commands")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        let ingestedLogs = 0;
        let ingestedResults = 0;
        const now = new Date().toISOString();

        // Logs
        if (data.logs && data.logs.length > 0) {
          const rows = data.logs.map((l) => ({
            agent_id: agent?.id ?? null,
            level: l.level,
            message: l.message,
            context: (l.context ?? null) as any,
            created_at: l.timestamp ?? now,
          }));
          const { error: logsErr } = await supabaseAdmin.from("agent_logs").insert(rows);
          if (logsErr) return err(500, "DB_ERROR", "Falha ao gravar logs");
          ingestedLogs = rows.length;
        }

        // Results
        if (data.results && data.results.length > 0) {
          for (const r of data.results) {
            await supabaseAdmin
              .from("command_results")
              .update({
                status: r.status,
                result: r.result ?? null,
                error_message: r.error_message ?? null,
                duration_ms: r.duration_ms ?? null,
                completed_at: r.completed_at ?? now,
              })
              .eq("command_id", r.command_id);
            ingestedResults++;
          }

          // Remove processed commands from the pending queue in a single update.
          if (agent) {
            const doneIds = new Set(data.results.map((r) => r.command_id));
            const queue = Array.isArray(agent.pending_commands) ? agent.pending_commands : [];
            const filtered = queue.filter((c: any) => !doneIds.has(c?.command_id));
            if (filtered.length !== queue.length) {
              await supabaseAdmin
                .from("agents")
                .update({ pending_commands: filtered as any })
                .eq("id", agent.id);
            }
          }
        }

        return Response.json(
          { success: true, ingested: { logs: ingestedLogs, results: ingestedResults } },
          { headers: CORS },
        );
      },
    },
  },
});
