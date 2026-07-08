import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyAgentSignature } from "@/lib/hmac.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FireSync-Signature",
};

const tableSchema = z.object({
  table_name: z
    .string({ required_error: "table_name é obrigatório" })
    .min(1, "table_name não pode ser vazio")
    .max(128, "table_name muito longo (máx 128)")
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "table_name deve ser um identificador SQL válido"),
  record_count: z
    .number({ invalid_type_error: "record_count deve ser numérico" })
    .int("record_count deve ser inteiro")
    .min(0, "record_count não pode ser negativo")
    .max(1_000_000, "record_count excede o limite (1.000.000)")
    .optional(),
  checksum: z.string().max(256).optional(),
  records: z
    .array(z.record(z.any()))
    .max(50_000, "records excede o limite (50.000 por tabela)")
    .optional(),
});

const syncPayloadSchema = z
  .object({
    agent_uid: z
      .string({ required_error: "agent_uid é obrigatório" })
      .min(3, "agent_uid muito curto (mín 3)")
      .max(128, "agent_uid muito longo (máx 128)")
      .regex(/^[A-Za-z0-9_\-:.]+$/, "agent_uid contém caracteres inválidos"),
    agent_version: z.string().max(64).optional(),
    timestamp: z
      .string()
      .datetime({ offset: true, message: "timestamp deve estar em formato ISO 8601" })
      .optional(),
    database_name: z.string().max(255).optional(),
    sync_type: z.enum(["full", "incremental", "delta", "test"]).optional(),
    tables: z
      .array(tableSchema)
      .min(1, "tables deve conter ao menos 1 tabela")
      .max(500, "tables excede o limite (500)"),
  })
  .strict();

function err(status: number, code: string, message: string, details?: unknown) {
  return Response.json(
    { success: false, error: { code, message, details } },
    { status, headers: CORS },
  );
}

export const Route = createFileRoute("/api/public/sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) return err(401, "MISSING_TOKEN", "Cabeçalho Authorization Bearer ausente");

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return err(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type deve ser application/json");
        }

        const raw = await request.text();
        if (!raw || raw.trim().length === 0) {
          return err(400, "EMPTY_BODY", "Corpo da requisição vazio");
        }
        if (raw.length > 10 * 1024 * 1024) {
          return err(413, "PAYLOAD_TOO_LARGE", "Payload excede 10MB");
        }

        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch (e: any) {
          return err(400, "INVALID_JSON", `JSON malformado: ${e.message}`);
        }

        const parsed = syncPayloadSchema.safeParse(json);
        if (!parsed.success) {
          const fieldErrors = parsed.error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          }));
          return err(422, "VALIDATION_ERROR", "Campos inválidos no payload", fieldErrors);
        }
        const payload = parsed.data;

        // valida coerência record_count vs records.length
        for (const t of payload.tables) {
          if (
            t.records &&
            typeof t.record_count === "number" &&
            t.records.length !== t.record_count
          ) {
            return err(
              422,
              "RECORD_COUNT_MISMATCH",
              `Tabela "${t.table_name}": record_count (${t.record_count}) não corresponde a records.length (${t.records.length})`,
            );
          }
        }

        const { data: db, error: dbErr } = await supabaseAdmin
          .from("databases")
          .select("id, agent_token")
          .eq("agent_uid", payload.agent_uid)
          .maybeSingle();

        if (dbErr) return err(500, "DB_ERROR", "Erro ao consultar banco");
        if (!db) return err(404, "AGENT_NOT_FOUND", `agent_uid "${payload.agent_uid}" não está registrado`);
        if (!db.agent_token) return err(401, "TOKEN_NOT_CONFIGURED", "Agente não possui token configurado");
        if (db.agent_token !== token) return err(401, "INVALID_TOKEN", "Token inválido ou revogado");

        const sig = verifyAgentSignature(request, raw, db.agent_token);
        if (!sig.ok) return err(401, sig.code, sig.message);

        const totalRecords = payload.tables.reduce((s, t) => s + (t.record_count ?? t.records?.length ?? 0), 0);
        const startedAt = payload.timestamp ?? new Date().toISOString();

        await supabaseAdmin.from("sync_logs").insert({
          database_id: db.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          duration_ms: 0,
          records_count: totalRecords,
          status: "success",
        });

        await supabaseAdmin
          .from("databases")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", db.id);

        const { data: existingAgent } = await supabaseAdmin
          .from("agents")
          .select("id, total_syncs")
          .eq("agent_uid", payload.agent_uid)
          .maybeSingle();

        if (existingAgent) {
          await supabaseAdmin
            .from("agents")
            .update({
              last_heartbeat_at: new Date().toISOString(),
              total_syncs: existingAgent.total_syncs + 1,
              status: "online",
              agent_version: payload.agent_version ?? null,
            })
            .eq("id", existingAgent.id);
        } else {
          await supabaseAdmin.from("agents").insert({
            agent_uid: payload.agent_uid,
            alias: payload.database_name ?? payload.agent_uid,
            database_id: db.id,
            agent_version: payload.agent_version ?? null,
            last_heartbeat_at: new Date().toISOString(),
            status: "online",
            total_syncs: 1,
          });
        }

        return Response.json(
          {
            success: true,
            records_received: totalRecords,
            tables_received: payload.tables.length,
          },
          { headers: CORS },
        );
      },
    },
  },
});
