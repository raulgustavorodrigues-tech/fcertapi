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

const resultSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  command_id: z.string().min(1).max(128),
  command_type: z.string().min(1).max(64),
  status: z.enum(["success", "error"]),
  result: z.any().optional(),
  error_message: z.string().max(2000).optional(),
  duration_ms: z.number().int().min(0).optional(),
  completed_at: z.string().optional(),
}).strict();

export const Route = createFileRoute("/api/public/command_result")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Authorization Bearer ausente");

        let body: unknown;
        try { body = await request.json(); } catch { return err(400, "INVALID_JSON", "Body inválido"); }

        const parsed = resultSchema.safeParse(body);
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

        const now = new Date().toISOString();
        const { error: updErr } = await supabaseAdmin
          .from("command_results")
          .update({
            status: data.status,
            result: data.result ?? null,
            error_message: data.error_message ?? null,
            duration_ms: data.duration_ms ?? null,
            completed_at: data.completed_at ?? now,
          })
          .eq("command_id", data.command_id);

        if (updErr) return err(500, "DB_ERROR", "Falha ao salvar resultado");

        // Remove from pending_commands
        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id, pending_commands")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        if (agent) {
          const queue = Array.isArray(agent.pending_commands) ? agent.pending_commands : [];
          const filtered = queue.filter((c: any) => c.command_id !== data.command_id);
          await supabaseAdmin
            .from("agents")
            .update({ pending_commands: filtered as any })
            .eq("id", agent.id);
        }

        return Response.json({ success: true }, { headers: CORS });
      },
    },
  },
});
