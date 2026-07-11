import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

// CORREÇÃO C3/C4: removida a manipulação de agents.pending_commands.
// Mantido por compatibilidade com agentes < 1.2; atualiza apenas linhas
// ainda não finalizadas (idempotência).

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
  error_message: z.string().max(2000).nullish(),
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

        const rawBody = await request.text();
        let body: unknown;
        try { body = JSON.parse(rawBody); } catch { return err(400, "INVALID_JSON", "Body inválido"); }

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
        if (!db.agent_token || db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido");

        const sig = verifyAgentSignature(request, rawBody, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

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
          .eq("command_id", data.command_id)
          .in("status", ["pending", "processing", "timeout"]);

        if (updErr) return err(500, "DB_ERROR", "Falha ao salvar resultado");

        return Response.json({ success: true }, { headers: CORS });
      },
    },
  },
});
