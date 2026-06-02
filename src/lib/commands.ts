import { supabase } from "@/integrations/supabase/client";

export type CommandType =
  | "ping_test"
  | "list_tables"
  | "run_query"
  | "force_sync";

export type PendingCommand = {
  command_id: string;
  type: CommandType;
  payload?: Record<string, any>;
  enqueued_at: string;
};

function genId() {
  return `cmd_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Enqueue a command for the agent attached to a database.
 * - Inserts a row in command_results (status=pending)
 * - Pushes onto agents.pending_commands
 */
export async function enqueueCommand(
  databaseId: string,
  type: CommandType,
  payload: Record<string, any> = {},
): Promise<{ command_id: string; agent_id: string | null }> {
  const command_id = genId();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, pending_commands")
    .eq("database_id", databaseId)
    .maybeSingle();

  const cmd: PendingCommand = {
    command_id,
    type,
    payload,
    enqueued_at: new Date().toISOString(),
  };

  if (agent) {
    const queue = Array.isArray(agent.pending_commands) ? agent.pending_commands : [];
    await supabase
      .from("agents")
      .update({ pending_commands: [...queue, cmd] })
      .eq("id", agent.id);
  }

  await supabase.from("command_results").insert({
    agent_id: agent?.id ?? null,
    database_id: databaseId,
    command_id,
    command_type: type,
    payload,
    status: "pending",
  });

  return { command_id, agent_id: agent?.id ?? null };
}

/**
 * Poll for a command result with timeout. Resolves when status is success/error/timeout
 * or rejects on timeout. Optional onUpdate callback fires on every poll with the current row.
 */
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

  // Mark as timeout
  await supabase
    .from("command_results")
    .update({
      status: "timeout",
      error_message: "Agente não respondeu dentro do tempo esperado",
      completed_at: new Date().toISOString(),
    })
    .eq("command_id", command_id);

  throw new Error("Tempo esgotado aguardando resposta do agente");
}

/**
 * Compute agent connection mode based on heartbeat and tunnel.
 */
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
