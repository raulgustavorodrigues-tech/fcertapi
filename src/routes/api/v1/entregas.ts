// GET /api/v1/entregas?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
// Header: Authorization: Bearer <api_key>
//
// Entrega as entregas sincronizadas para aplicações consumidoras (Logitech).
// A chave vai no HEADER (nunca na URL) e é validada por hash SHA-256.

import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function err(status: number, code: string, message: string) {
  return Response.json({ success: false, error: { code, message } }, { status, headers: CORS });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_LIMIT = 5000;

export const Route = createFileRoute("/api/v1/entregas")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const apiKey = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!apiKey) return err(401, "MISSING_KEY", "Authorization Bearer ausente");

        const keyHash = await sha256Hex(apiKey);
        const { data: key } = await supabaseAdmin
          .from("api_keys")
          .select("id, company_id, database_id, scopes, revoked_at")
          .eq("key_hash", keyHash)
          .maybeSingle();

        if (!key) return err(401, "INVALID_KEY", "Chave inválida");
        if (key.revoked_at) return err(401, "REVOKED_KEY", "Chave revogada");
        if (!key.scopes?.includes("entregas:read")) {
          return err(403, "FORBIDDEN", "Chave sem permissão entregas:read");
        }

        const url = new URL(request.url);
        const dataInicio = url.searchParams.get("data_inicio");
        const dataFim = url.searchParams.get("data_fim");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000) || 1000, MAX_LIMIT);
        const offset = Number(url.searchParams.get("offset") ?? 0) || 0;

        const isoDate = /^\d{4}-\d{2}-\d{2}$/;
        if (!dataInicio || !isoDate.test(dataInicio)) {
          return err(422, "INVALID_PARAM", "data_inicio obrigatório no formato YYYY-MM-DD");
        }
        if (dataFim && !isoDate.test(dataFim)) {
          return err(422, "INVALID_PARAM", "data_fim deve estar no formato YYYY-MM-DD");
        }

        let q = supabaseAdmin
          .from("entregas_sync")
          .select(
            "cdfilentg, nrentg, dtentg, cdreg, periodo, cdclides, nomecli, nrtel, nrcep, endrf, endnr, endcp, bairr, munic, unfed, cdfilentgdes, qtform, flagentg, obsentg, synced_at",
            { count: "exact" },
          )
          .gte("dtentg", dataInicio)
          .lte("dtentg", dataFim ?? dataInicio)
          .order("dtentg", { ascending: true })
          .order("nrentg", { ascending: true })
          .range(offset, offset + limit - 1);

        // Escopo da chave: limita ao banco/empresa autorizados
        if (key.database_id) {
          q = q.eq("database_id", key.database_id);
        } else if (key.company_id) {
          const { data: dbs } = await supabaseAdmin
            .from("databases")
            .select("id")
            .eq("company_id", key.company_id);
          q = q.in("database_id", (dbs ?? []).map((d) => d.id));
        }

        const { data: rows, count, error } = await q;
        if (error) return err(500, "DB_ERROR", "Falha ao consultar entregas");

        // Auditoria + marca uso da chave
        await supabaseAdmin.from("api_access_log").insert({
          api_key_id: key.id,
          endpoint: "/api/v1/entregas",
          params: { data_inicio: dataInicio, data_fim: dataFim, limit, offset },
          rows_returned: rows?.length ?? 0,
          status: 200,
        });
        await supabaseAdmin
          .from("api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", key.id);

        return Response.json(
          {
            success: true,
            data: rows ?? [],
            pagination: { limit, offset, returned: rows?.length ?? 0, total: count ?? null },
          },
          { headers: CORS },
        );
      },
    },
  },
});
