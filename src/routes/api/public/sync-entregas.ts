import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FireSync-Signature",
};
function err(s: number, code: string, m: string) {
  return Response.json({ success: false, error: { code, message: m } }, { status: s, headers: CORS });
}

const rowSchema = z.object({
  cdfilentg: z.number().int(),
  nrentg: z.number().int(),
  dtentg: z.string().nullable().optional(),
  cdreg: z.number().int().nullable().optional(),
  periodo: z.number().int().nullable().optional(),
  cdclides: z.number().int().nullable().optional(),
  nomecli: z.string().nullable().optional(),
  nrtel: z.string().nullable().optional(),
  nrcep: z.string().nullable().optional(),
  endrf: z.string().nullable().optional(),
  endnr: z.string().nullable().optional(),
  endcp: z.string().nullable().optional(),
  bairr: z.string().nullable().optional(),
  munic: z.string().nullable().optional(),
  unfed: z.string().nullable().optional(),
  cdfilentgdes: z.number().int().nullable().optional(),
  qtform: z.number().int().nullable().optional(),
  flagentg: z.string().nullable().optional(),
  obsentg: z.string().nullable().optional(),
}).passthrough();

const payloadSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  window_days: z.number().int().min(1).max(365).optional(),
  rows: z.array(rowSchema).max(50000),
}).strict();

export const Route = createFileRoute("/api/public/sync-entregas")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Bearer ausente");

        const raw = await request.text();
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return err(400, "INVALID_JSON", "Body inválido"); }
        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) return err(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "inválido");
        const data = parsed.data;

        const { data: db } = await supabaseAdmin
          .from("databases").select("id, agent_token").eq("agent_uid", data.agent_uid).maybeSingle();
        if (!db) return err(404, "AGENT_NOT_FOUND", "agent_uid não registrado");
        if (!db.agent_token || db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido");

        const sig = verifyAgentSignature(request, raw, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

        const now = new Date().toISOString();

        const rows = data.rows.map((r) => ({ ...r, database_id: db.id, synced_at: now }));
        let upserted = 0;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabaseAdmin
            .from("entregas_sync")
            .upsert(chunk, { onConflict: "database_id,cdfilentg,nrentg" });
          if (error) return err(500, "DB_ERROR", `Falha no upsert: ${error.message}`);
          upserted += chunk.length;
        }

        await supabaseAdmin.from("entregas_sync_status").upsert({
          database_id: db.id,
          last_sync_at: now,
          rows_synced: upserted,
          window_days: data.window_days ?? 30,
        }, { onConflict: "database_id" });

        return Response.json({ success: true, upserted }, { headers: CORS });
      },
    },
  },
});
