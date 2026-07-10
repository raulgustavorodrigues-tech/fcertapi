import { supabase } from "@/integrations/supabase/client";

// CORREÇÕES C2/C3/C4:
//  - enqueueCommand é INSERT-ONLY em command_results (o array JSONB
//    agents.pending_commands foi aposentado; quem entrega é o /heartbeat)
//  - assertReadOnlySql(): defesa em profundidade no cliente para run_query
//    (a validação definitiva acontece no agente v1.3+)

export type CommandType =
  | "ping_test"
  | "list_tables"
  | "run_query"
  | "force_sync"
  | "network_test";

export type PendingCommand = {
  command_id: string;
  type: CommandType;
  payload?: Record<string, any>;
  enqueued_at: string;
};

function genId() {
  return `cmd_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|RECREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|COMMIT|ROLLBACK|SET\s+GENERATOR|SET\s+STATISTICS)\b/i;

/** Remove literais de string e comentários para inspecionar apenas keywords. */
function stripSqlNoise(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Garante que o SQL é uma única instrução de leitura (SELECT/WITH). */
export function assertReadOnlySql(sql: string): void {
  const stripped = stripSqlNoise(sql).trim().replace(/;\s*$/, "");
  if (!stripped) throw new Error("SQL vazio");
  if (stripped.includes(";")) {
    throw new Error("Apenas uma instrução por execução (remova os ';' intermediários)");
  }
  const first = stripped.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
  if (first !== "SELECT" && first !== "WITH") {
    throw new Error("Apenas consultas SELECT/WITH são permitidas pelo módulo Queries");
  }
  const bad = stripped.match(FORBIDDEN_SQL);
  if (bad) {
    throw new Error(`Instrução de escrita/DDL bloqueada: "${bad[0].toUpperCase()}" não é permitida`);
  }
}

/** Enfileira um comando: UMA linha em command_results; o heartbeat entrega. */
export async function enqueueCommand(
  databaseId: string,
  type: CommandType,
  payload: Record<string, any> = {},
): Promise<{ command_id: string; agent_id: string | null }> {
  if (type === "run_query") {
    assertReadOnlySql(String(payload?.sql ?? ""));
  }

  const command_id = genId();

  // agent_id é apenas informativo; a entrega é por database_id
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("database_id", databaseId)
    .maybeSingle();

  const { error } = await supabase.from("command_results").insert({
    agent_id: agent?.id ?? null,
    database_id: databaseId,
    command_id,
    command_type: type,
    payload,
    status: "pending",
  });
  if (error) throw error;

  return { command_id, agent_id: agent?.id ?? null };
}

/** Aguarda o resultado com timeout; marca timeout se o agente não responder. */
export async function awaitCommandResult(
  command_id: string,
  opts: { timeoutMs?: number; intervalMs?: number; onUpdate?: (row: any) => void } = {},
): Promise<any> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from("command_results")
      .select("*")
      .eq("command_id", command_id)
      .maybeSingle();

    if (data) {
      opts.onUpdate?.(data);
      if (data.status === "success" || data.status === "error") {
        return data;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  await supabase
    .from("command_results")
    .update({
      status: "timeout",
      error_message: "Agente não respondeu dentro do tempo esperado",
      completed_at: new Date().toISOString(),
    })
    .eq("command_id", command_id)
    .in("status", ["pending", "processing"]);

  throw new Error("Tempo esgotado aguardando resposta do agente");
}

export function agentConnectionMode(agent: {
  last_heartbeat_at?: string | null;
  tunnel_url?: string | null;
}): { mode: "offline" | "tunnel" | "push"; label: string; tone: "success" | "muted" | "destructive" } {
  if (!agent.last_heartbeat_at) {
    return { mode: "offline", label: "Offline", tone: "destructive" };
  }
  const ageMs = Date.now() - new Date(agent.last_heartbeat_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    return { mode: "offline", label: "Offline", tone: "destructive" };
  }
  if (agent.tunnel_url) {
    return { mode: "tunnel", label: "Tunnel ativo", tone: "success" };
  }
  return { mode: "push", label: "Push only", tone: "muted" };
}

export function heartbeatTone(last: string | null | undefined): {
  color: "success" | "warning" | "destructive";
  ageSeconds: number | null;
  label: string;
} {
  if (!last) return { color: "destructive", ageSeconds: null, label: "Sem heartbeat" };
  const ageSec = Math.floor((Date.now() - new Date(last).getTime()) / 1000);
  if (ageSec < 60) return { color: "success", ageSeconds: ageSec, label: `há ${ageSec}s` };
  if (ageSec < 300) return { color: "warning", ageSeconds: ageSec, label: `há ${Math.floor(ageSec / 60)}min` };
  return { color: "destructive", ageSeconds: ageSec, label: `há ${Math.floor(ageSec / 60)}min` };
}
