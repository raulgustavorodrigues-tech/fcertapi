// Recebe do agente os dados do Pedido Magistral (7 tabelas do Firebird).
// Cada POST traz uma tabela e um lote de linhas. Tabelas "snapshot" (cadastro)
// aceitam reset=true no 1º lote para substituir tudo; as de histórico fazem upsert.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyAgentSignature } from "@/lib/hmac.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FireSync-Signature",
};
function err(s: number, code: string, m: string) {
  return Response.json({ success: false, error: { code, message: m } }, { status: s, headers: CORS });
}

type ColType = "t" | "n" | "d";
const TABLES: Record<string, { cols: Record<string, ColType>; key: string[] }> = {
  produtos: { cols: { cdpro: "t", descr: "t", unida: "t", situa: "t", indbloqueio: "t", grupo: "t", indsngpc: "t", prcom: "n" }, key: ["cdpro"] },
  estoque: { cols: { cdfil: "t", cdpro: "t", estmi: "n", estma: "n", estat: "n" }, key: ["cdfil", "cdpro"] },
  precos: { cols: { cdpro: "t", dtreaj: "d", prcom: "n" }, key: ["cdpro", "dtreaj"] },
  lotes: { cols: { cdfil: "t", cdpro: "t", ctlot: "t", stlot: "t", nrlot: "t", nrnot: "t", dtent: "d", dtval: "d", estat: "n" }, key: ["cdfil", "cdpro", "ctlot"] },
  consumo_mensal: { cols: { cdpro: "t", mes: "t", qtreal: "n" }, key: ["cdpro", "mes"] },
  notas: { cols: { cdpro: "t", nrnot: "t", fornecid: "t", dtent: "d", quant: "n", pruni: "n" }, key: ["cdpro", "nrnot", "fornecid", "dtent"] },
  fornecedores: { cols: { fornecid: "t", nrcnpj: "t", fanta: "t" }, key: ["fornecid"] },
};

function coerce(v: unknown, t: ColType): string | number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  if (t === "n") { const n = Number(s.replace(",", ".")); return Number.isFinite(n) ? n : null; }
  if (t === "d") return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  return s.slice(0, 500);
}

const payloadSchema = z.object({
  agent_uid: z.string().min(3).max(128),
  table: z.enum(Object.keys(TABLES) as [string, ...string[]]),
  reset: z.boolean().optional(),
  final: z.boolean().optional(),
  rows: z.array(z.record(z.unknown())).max(10000),
}).strict();

export const Route = createFileRoute("/api/public/sync-pedido-magistral")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Bearer ausente");
        const raw = await request.text();
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return err(400, "INVALID_JSON", "Body inválido"); }
        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          const e0 = parsed.error.errors[0];
          return err(422, "VALIDATION_ERROR", `${e0?.path?.join(".") ?? "?"}: ${e0?.message ?? "inválido"}`);
        }
        const data = parsed.data;

        const { data: db } = await supabaseAdmin
          .from("databases").select("id, agent_token").eq("agent_uid", data.agent_uid).maybeSingle();
        if (!db) return err(404, "AGENT_NOT_FOUND", "agent_uid não registrado");
        if (!db.agent_token || db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido");
        const sig = verifyAgentSignature(request, raw, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

        const cfg = TABLES[data.table];
        const tableName = `pm_${data.table}` as any;
        const now = new Date().toISOString();
        const seen = new Set<string>();
        const rows: Record<string, unknown>[] = [];
        for (const r of data.rows) {
          const out: Record<string, unknown> = { database_id: db.id, synced_at: now };
          for (const [c, t] of Object.entries(cfg.cols)) out[c] = coerce(r[c], t);
          if (cfg.key.some((k) => out[k] === null)) continue;
          const k = cfg.key.map((c) => out[c]).join("|");
          if (seen.has(k)) continue;
          seen.add(k);
          rows.push(out);
        }

        if (data.reset) {
          const { error } = await supabaseAdmin.from(tableName).delete().eq("database_id", db.id);
          if (error) return err(500, "DB_ERROR", `Falha ao limpar: ${error.message}`);
        }
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabaseAdmin
            .from(tableName)
            .upsert(rows.slice(i, i + 500) as any, { onConflict: ["database_id", ...cfg.key].join(",") });
          if (error) return err(500, "DB_ERROR", `Falha no upsert: ${error.message}`);
        }

        const { data: st } = await supabaseAdmin
          .from("pm_sync_status").select("rows_by_table").eq("database_id", db.id).maybeSingle();
        const byTable = { ...((st?.rows_by_table as Record<string, number>) ?? {}) };
        byTable[data.table] = (data.reset ? 0 : byTable[data.table] ?? 0) + rows.length;
        await supabaseAdmin.from("pm_sync_status").upsert(
          { database_id: db.id, last_sync_at: now, rows_by_table: byTable }, { onConflict: "database_id" });

        if (data.final) {
          await supabaseAdmin.from("sync_logs").insert({
            database_id: db.id, started_at: now, finished_at: now, duration_ms: 0,
            records_count: Object.values(byTable).reduce((a, b) => a + (b || 0), 0), status: "success",
          });
        }
        return Response.json({ success: true, upserted: rows.length }, { headers: CORS });
      },
    },
  },
});
