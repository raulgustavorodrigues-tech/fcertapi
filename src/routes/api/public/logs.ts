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

const logEntry = z.object({
  level: z.enum(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1).max(4000),
  context: z.record(z.any()).optional(),
  timestamp: z.string().optional(),
});

const payloadSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  logs: z.array(logEntry).min(1).max(500),
}).strict();

export const Route = createFileRoute("/api/public/logs")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Authorization Bearer ausente");

        let body: unknown;
        try { body = await request.json(); } catch { return err(400, "INVALID_JSON", "Body inválido"); }
        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) return err(422, "VALIDATION_ERROR", "Payload inválido");
        const data = parsed.data;

        const { data: db } = await supabaseAdmin
          .from("databases")
          .select("id, agent_token")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();
        if (!db) return err(404, "AGENT_NOT_FOUND", "agent_uid não registrado");
        if (db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido");

        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        const rows = data.logs.map((l) => ({
          agent_id: agent?.id ?? null,
          level: l.level,
          message: l.message,
          context: (l.context ?? null) as any,
          created_at: l.timestamp ?? new Date().toISOString(),
        }));

        const { error } = await supabaseAdmin.from("agent_logs").insert(rows);
        if (error) return err(500, "DB_ERROR", "Falha ao gravar logs");

        return Response.json({ success: true, ingested: rows.length }, { headers: CORS });
      },
    },
  },
});
