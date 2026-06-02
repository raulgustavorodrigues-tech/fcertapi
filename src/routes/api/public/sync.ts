import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const syncPayloadSchema = z.object({
  agent_uid: z.string().min(1),
  agent_version: z.string().optional(),
  timestamp: z.string().optional(),
  database_name: z.string().optional(),
  sync_type: z.string().optional(),
  tables: z
    .array(
      z.object({
        table_name: z.string(),
        record_count: z.number().optional(),
        checksum: z.string().optional(),
        records: z.array(z.record(z.any())).optional(),
      }),
    )
    .optional(),
});

export const Route = createFileRoute("/api/public/sync")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      },
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");

        if (!token) {
          return new Response("Unauthorized: missing token", {
            status: 401,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          });
        }

        let payload: z.infer<typeof syncPayloadSchema>;
        try {
          payload = syncPayloadSchema.parse(await request.json());
        } catch (e: any) {
          return new Response(`Invalid payload: ${e.message}`, {
            status: 400,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          });
        }

        const { data: db } = await supabaseAdmin
          .from("databases")
          .select("id, agent_token")
          .eq("agent_uid", payload.agent_uid)
          .single();

        if (!db || db.agent_token !== token) {
          return new Response("Unauthorized: invalid agent", {
            status: 401,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          });
        }

        const totalRecords =
          payload.tables?.reduce(
            (sum, t) => sum + (t.record_count ?? 0),
            0,
          ) ?? 0;

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
          { success: true, records_received: totalRecords },
          {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          },
        );
      },
    },
  },
});
