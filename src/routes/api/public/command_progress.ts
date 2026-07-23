import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

// Progresso intermediário de comandos longos (ex.: list_tables).
// Não finaliza o comando — apenas atualiza status=processing + result.progress
// para a UI mostrar barra de percentual/ETA em tempo real.

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

const progressSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  command_id: z.string().min(1).max(128),
  progress: z.object({
    done: z.number().int().min(0),
    total: z.number().int().min(0),
    label: z.string().max(200).optional(),
    started_at: z.string().optional(),
  }),
}).strict();

export const Route = createFileRoute("/api/public/command_progress")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Authorization Bearer ausente");

        const rawBody = await request.text();
        let body: unknown;
        try { body = JSON.parse(rawBody); } catch { return err(400, "INVALID_JSON", "Body inválido"); }

        const parsed = progressSchema.safeParse(body);
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

        // Só avança pending → processing; nunca sobrescreve success/error.
        const { error: updErr } = await supabaseAdmin
          .from("command_results")
          .update({
            status: "processing",
            result: { progress: data.progress },
          })
          .eq("command_id", data.command_id)
          .in("status", ["pending", "processing"]);

        if (updErr) return err(500, "DB_ERROR", "Falha ao salvar progresso");

        return Response.json({ success: true }, { headers: CORS });
      },
    },
  },
});
