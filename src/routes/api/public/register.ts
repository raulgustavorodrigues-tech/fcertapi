import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

// CORREÇÃO C1: antes este endpoint não exigia autenticação e RETORNAVA o
// agent_token — qualquer um com um agent_uid previsível obtinha o token.
// Agora: Bearer obrigatório (deve conferir com databases.agent_token),
// HMAC verificado, e o token NUNCA é gerado nem retornado aqui.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FireSync-Signature",
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

export const Route = createFileRoute("/api/public/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Authorization Bearer ausente");

        const raw = await request.text();
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return err(400, "INVALID_JSON", "Body inválido"); }
        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) return err(422, "VALIDATION_ERROR", "Payload inválido");
        const data = parsed.data;

        const { data: db } = await supabaseAdmin
          .from("databases")
          .select("id, agent_token, sync_interval, sync_tables, name")
          .eq("agent_uid", data.agent_uid)
          .maybeSingle();

        if (!db) return err(404, "AGENT_NOT_FOUND", "agent_uid não está cadastrado em nenhum banco");
        if (!db.agent_token) {
          return err(401, "TOKEN_NOT_CONFIGURED",
            "Este banco ainda não possui token. Gere o token no Hub (Bancos > Editar > Gerar token) e baixe o instalador novamente.");
        }
        if (db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido ou revogado");

        const sig = verifyAgentSignature(request, raw, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

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

        // IMPORTANTE: o token NÃO é retornado. Apenas configuração operacional.
        return Response.json({
          success: true,
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
