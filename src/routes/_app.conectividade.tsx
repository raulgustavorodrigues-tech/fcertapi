import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wifi, Zap, Activity, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { enqueueCommand, awaitCommandResult } from "@/lib/commands";

export const Route = createFileRoute("/_app/conectividade")({ component: Page });

type Step = { name: string; status: "pending" | "running" | "ok" | "error"; detail?: string; ms?: number };

const TIMEOUT_SECONDS = 60;

function Page() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "waiting" | "executing" | "done">("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [finalResult, setFinalResult] = useState<{ ok: boolean; latency?: number; detail?: string } | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  const { data: databases = [] } = useQuery({
    queryKey: ["databases-list-conn"],
    queryFn: async () => {
      const { data } = await supabase
        .from("databases")
        .select("id, name, agent_uid, companies(name), agents(status, last_heartbeat_at, tunnel_url)")
        .order("name");
      return data ?? [];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["connectivity_logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("connectivity_logs")
        .select("*, databases(name, companies(name))")
        .order("tested_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  async function runTest() {
    if (!target) { toast.error("Selecione um banco cadastrado"); return; }
    const db = databases.find((d: any) => d.id === target);
    if (!db?.agent_uid) { toast.error("Banco não tem agent_uid configurado"); return; }

    setRunning(true);
    setPhase("waiting");
    setSteps([]);
    setFinalResult(null);
    setWaitElapsed(0);

    let command_id: string;
    try {
      const r = await enqueueCommand(target, "ping_test", {});
      command_id = r.command_id;
    } catch (e: any) {
      toast.error("Falha ao enfileirar comando");
      setRunning(false); setPhase("idle");
      return;
    }

    // tick wait progress
    const startTs = Date.now();
    tickRef.current = setInterval(() => {
      setWaitElapsed(Math.floor((Date.now() - startTs) / 1000));
    }, 250);

    try {
      const row = await awaitCommandResult(command_id, {
        timeoutMs: TIMEOUT_SECONDS * 1000,
        intervalMs: 2000,
        onUpdate: (r) => {
          if (r.status === "processing" && phase === "waiting") {
            setPhase("executing");
            setSteps([
              { name: "Ping respondido", status: "running" },
              { name: "Autenticação SYSDBA", status: "pending" },
              { name: "Banco Firebird acessível", status: "pending" },
              { name: "Query de teste OK", status: "pending" },
            ]);
          }
        },
      });

      if (tickRef.current) clearInterval(tickRef.current);
      const res = row.result ?? {};
      const ok = row.status === "success";
      const latency = res.latency_ms ?? row.duration_ms ?? 0;

      const newSteps: Step[] = [
        { name: "Ping respondido", status: res.ping_ok !== false ? "ok" : "error", ms: latency, detail: res.ping_error },
        { name: "Autenticação SYSDBA", status: res.auth_ok !== false ? "ok" : "error", detail: res.auth_error },
        { name: "Banco Firebird acessível", status: res.db_reachable !== false ? "ok" : "error", detail: res.db_error },
        { name: "Query de teste OK", status: res.test_query_ok !== false ? "ok" : "error", detail: res.query_error },
      ];
      // If we don't have granular flags, fall back to overall ok
      if (res.ping_ok === undefined && !ok) {
        for (const s of newSteps) s.status = "error";
        newSteps[0].detail = row.error_message ?? "Falha desconhecida";
      }
      setSteps(newSteps);
      setPhase("done");
      setFinalResult({ ok, latency, detail: row.error_message ?? undefined });

      await supabase.from("connectivity_logs").insert({
        database_id: target,
        latency_ms: latency,
        result: ok ? "success" : "error",
        step_failed: ok ? null : newSteps.find((s) => s.status === "error")?.name ?? "unknown",
        error_detail: row.error_message,
      });
      await supabase.from("databases").update({ status: ok ? "connected" : "disconnected" }).eq("id", target);
      qc.invalidateQueries({ queryKey: ["connectivity_logs"] });
      qc.invalidateQueries({ queryKey: ["databases"] });

      ok ? toast.success(`Conexão OK em ${latency}ms`) : toast.error("Falha no diagnóstico");
    } catch (e: any) {
      if (tickRef.current) clearInterval(tickRef.current);
      setPhase("done");
      setFinalResult({ ok: false, detail: e.message });
      toast.error("Agente não respondeu. Verifique se o agente está rodando.");
      await supabase.from("connectivity_logs").insert({
        database_id: target,
        latency_ms: 0,
        result: "error",
        step_failed: "timeout",
        error_detail: e.message,
      });
      qc.invalidateQueries({ queryKey: ["connectivity_logs"] });
    } finally {
      setRunning(false);
    }
  }

  const selectedDb = databases.find((d: any) => d.id === target);
  const waitPct = Math.min(100, (waitElapsed / 30) * 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card className="p-5 bg-card border-border">
          <h3 className="font-mono text-sm font-semibold mb-4 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" /> Diagnóstico assíncrono (Push + Command Queue)
          </h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Selecione um banco para testar" /></SelectTrigger>
                <SelectContent>
                  {databases.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.companies?.name} · {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDb && (
                <p className="text-[10px] text-muted-foreground font-mono mt-1">
                  agent_uid: {selectedDb.agent_uid ?? "(não definido)"}
                </p>
              )}
            </div>
            <Button onClick={runTest} disabled={running || !target} className="w-full">
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Zap className="h-4 w-4 mr-1.5" />}
              {running ? "Executando…" : "Testar conexão"}
            </Button>
          </div>

          {phase === "waiting" && (
            <div className="mt-5 p-4 rounded border border-dashed border-primary/40 bg-primary/5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-mono">
                <Clock className="h-4 w-4 text-primary animate-pulse" />
                Aguardando o agente…
              </div>
              <p className="text-xs text-muted-foreground">
                O agente buscará este comando no próximo heartbeat (máx. 30s).
              </p>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${waitPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                <span>{waitElapsed}s</span>
                <span>timeout {TIMEOUT_SECONDS}s</span>
              </div>
            </div>
          )}

          {(phase === "executing" || phase === "done") && steps.length > 0 && (
            <div className="mt-5 space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-background/60 border border-border rounded font-mono text-xs">
                  <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                  {s.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted" />}
                  {s.status === "running" && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                  {s.status === "ok" && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {s.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="flex-1">{s.name}</span>
                  {s.ms !== undefined && <span className="text-muted-foreground">{s.ms}ms</span>}
                  {s.detail && <span className="text-destructive text-[10px] max-w-[40%] truncate">{s.detail}</span>}
                </div>
              ))}
              {finalResult && (
                <div className={`mt-3 p-3 rounded border font-mono text-xs ${
                  finalResult.ok
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}>
                  <div className="font-semibold uppercase tracking-wider mb-1">
                    {finalResult.ok ? "SUCESSO" : "FALHA"}
                  </div>
                  <div className="text-foreground/80">
                    {finalResult.ok
                      ? `Latência total ${finalResult.latency}ms`
                      : finalResult.detail ?? "Erro desconhecido"}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5 bg-card border-border">
        <h3 className="font-mono text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-secondary" /> Histórico
        </h3>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum teste realizado ainda.</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {logs.map((l: any) => (
              <div key={l.id} className="p-2.5 bg-background/60 border border-border rounded text-xs font-mono">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={l.result === "success" ? "success" : l.result === "error" ? "destructive" : "muted"}>
                    {l.result.toUpperCase()}
                  </Badge>
                  <span className="text-muted-foreground text-[10px]">{formatRelative(l.tested_at)}</span>
                </div>
                <div className="text-foreground truncate">{l.databases?.name ?? "—"}</div>
                <div className="text-muted-foreground text-[10px]">
                  {l.latency_ms ?? 0}ms{l.step_failed ? ` · falhou em ${l.step_failed}` : ""}
                </div>
                {l.error_detail && <div className="text-destructive text-[10px] mt-1 truncate">{l.error_detail}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
