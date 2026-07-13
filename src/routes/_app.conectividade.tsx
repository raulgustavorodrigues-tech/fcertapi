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
import {
  Wifi, Zap, Activity, CheckCircle2, XCircle, Loader2, Clock,
  AlertTriangle, Network, Database, ShieldCheck, FileWarning, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { enqueueCommand, awaitCommandResult, heartbeatTone } from "@/lib/commands";

export const Route = createFileRoute("/_app/conectividade")({ component: Page });

type StepStatus = "pending" | "running" | "ok" | "warn" | "error" | "skip";
type Step = {
  key: string;
  name: string;
  icon: any;
  status: StepStatus;
  detail?: string;
  evidence?: string;
  ms?: number;
  hint?: string;
};

const TIMEOUT_SECONDS = 60;

function StepRow({ s, idx }: { s: Step; idx: number }) {
  const Icon = s.icon;
  return (
    <div className="p-3 bg-background/60 border border-border rounded-md space-y-1.5">
      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="text-muted-foreground w-5 text-right">{idx + 1}.</span>
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-foreground">{s.name}</span>
        {s.ms !== undefined && s.ms > 0 && (
          <span className="text-muted-foreground text-[10px]">{s.ms}ms</span>
        )}
        {s.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted" />}
        {s.status === "running" && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
        {s.status === "ok" && <CheckCircle2 className="h-4 w-4 text-success" />}
        {s.status === "warn" && <AlertTriangle className="h-4 w-4 text-warning" />}
        {s.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
        {s.status === "skip" && <Badge variant="muted" className="text-[9px]">SKIP</Badge>}
      </div>
      {(s.detail || s.evidence) && (
        <div className={`pl-12 text-[11px] font-mono ${s.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {s.detail}
          {s.evidence && (
            <div className="mt-1 px-2 py-1 bg-muted/30 rounded text-foreground/70 break-all">
              {s.evidence}
            </div>
          )}
        </div>
      )}
      {s.hint && s.status === "error" && (
        <div className="pl-12 flex items-start gap-1.5 text-[11px] text-warning">
          <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{s.hint}</span>
        </div>
      )}
    </div>
  );
}

function Page() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [overall, setOverall] = useState<{ ok: boolean; cause?: string; latency?: number } | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  const { data: databases = [] } = useQuery({
    queryKey: ["databases-list-conn"],
    queryFn: async () => {
      const { data: dbs } = await supabase
        .from("databases")
        .select("id, name, agent_uid, host, port, companies(name)")
        .order("name");
      const list = dbs ?? [];
      const uids = Array.from(new Set(list.map((d: any) => d.agent_uid).filter(Boolean))) as string[];
      const agentsByUid: Record<string, any> = {};
      const agentsByDbId: Record<string, any> = {};
      if (uids.length > 0) {
        const { data: ags } = await supabase
          .from("agents")
          .select("agent_uid, database_id, status, last_heartbeat_at, tunnel_url, agent_version")
          .in("agent_uid", uids);
        (ags ?? []).forEach((a: any) => {
          if (a.agent_uid) agentsByUid[a.agent_uid] = a;
          if (a.database_id) agentsByDbId[a.database_id] = a;
        });
      }
      return list.map((d: any) => ({
        ...d,
        agents: (d.agent_uid && agentsByUid[d.agent_uid]) || agentsByDbId[d.id] || null,
      }));
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["agent_events", "connectivity_test"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agent_events")
        .select("*, databases(name, companies(name))")
        .eq("event_type", "connectivity_test")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  function setStep(key: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  async function runDiagnostic() {
    if (!target) { toast.error("Selecione um banco cadastrado"); return; }
    const db: any = databases.find((d: any) => d.id === target);
    if (!db?.agent_uid) { toast.error("Banco não tem agent_uid configurado"); return; }

    setRunning(true);
    setOverall(null);
    setWaitElapsed(0);

    const initial: Step[] = [
      { key: "agent_online", name: "Agente online (heartbeat recente)", icon: Wifi, status: "running" },
      { key: "net_dns",      name: "DNS do endpoint de heartbeat",      icon: Network, status: "pending" },
      { key: "net_https",    name: "HTTPS para o FireSync Hub",         icon: Network, status: "pending" },
      { key: "net_port",     name: "TCP porta Firebird (3050)",         icon: Network, status: "pending" },
      { key: "file_fdb",     name: "Arquivo .FDB acessível",            icon: FileWarning, status: "pending" },
      { key: "auth_sysdba",  name: "Autenticação SYSDBA",               icon: ShieldCheck, status: "pending" },
      { key: "db_reach",     name: "Banco Firebird responde",           icon: Database, status: "pending" },
      { key: "test_sql",     name: "Query de teste (SELECT 1)",         icon: Zap, status: "pending" },
    ];
    setSteps(initial);

    // 1) Heartbeat — verificação Hub-side, não precisa do agente
    const hb = db.agents?.last_heartbeat_at;
    const tone = heartbeatTone(hb);
    if (tone.color === "destructive") {
      setStep("agent_online", {
        status: "error",
        detail: hb ? `Último heartbeat ${tone.label}` : "Agente nunca enviou heartbeat",
        hint: "Agente offline. Verifique se o serviço FireSyncAgent está em execução (sc query FireSyncAgent) e se há saída HTTPS liberada.",
      });
      ["net_dns", "net_https", "net_port", "file_fdb", "auth_sysdba", "db_reach", "test_sql"].forEach((k) =>
        setStep(k, { status: "skip", detail: "Aguardando agente ficar online" }),
      );
      setOverall({ ok: false, cause: "Agente offline" });
      await persistResult(target, false, 0, "agent_offline", "Agente sem heartbeat recente");
      setRunning(false);
      return;
    }
    setStep("agent_online", {
      status: tone.color === "warning" ? "warn" : "ok",
      detail: `Heartbeat ${tone.label} · versão ${db.agents?.agent_version ?? "?"}`,
    });

    // 2) Enfileira network_test no agente
    setStep("net_dns", { status: "running" });
    let netResult: any = null;
    try {
      const r = await enqueueCommand(target, "network_test", {});
      netResult = await awaitWithTick(r.command_id, "Aguardando network_test no próximo heartbeat…");
    } catch (e: any) {
      ["net_dns", "net_https", "net_port"].forEach((k) =>
        setStep(k, { status: "error", detail: "Agente não respondeu", hint: "Confirme que o agente está consumindo a fila." }),
      );
    }
    if (netResult?.result?.steps) {
      const ns: any[] = netResult.result.steps;
      const dns = ns.find((x) => x.name?.startsWith("DNS"));
      const https = ns.find((x) => x.name?.startsWith("HTTPS"));
      const tcp = ns.find((x) => x.name?.startsWith("TCP"));
      setStep("net_dns", dns
        ? { status: dns.ok ? "ok" : "error", detail: dns.detail, ms: dns.latency_ms,
            hint: dns.ok ? undefined : "Verifique resolução DNS local; teste 'nslookup' no host do agente." }
        : { status: "skip" });
      setStep("net_https", https
        ? { status: https.ok ? "ok" : "error", detail: https.detail, ms: https.latency_ms,
            hint: https.ok ? undefined : "Firewall/proxy bloqueando HTTPS 443 para *.lovable.app. Libere saída." }
        : { status: "skip" });
      setStep("net_port", tcp
        ? { status: tcp.ok ? "ok" : (tcp.name.includes("embedded") ? "skip" : "error"),
            detail: tcp.detail, ms: tcp.latency_ms,
            hint: tcp.ok ? undefined : "Firebird Server inativo ou porta 3050 bloqueada. Verifique o serviço Firebird e o firewall no servidor do banco." }
        : { status: "skip" });
    }

    // 3) Enfileira ping_test granular (.FDB, SYSDBA, DB, SELECT 1)
    setStep("file_fdb", { status: "running" });
    let pingResult: any = null;
    try {
      const r = await enqueueCommand(target, "ping_test", {});
      pingResult = await awaitWithTick(r.command_id, "Aguardando ping_test no próximo heartbeat…");
    } catch (e: any) {
      ["file_fdb", "auth_sysdba", "db_reach", "test_sql"].forEach((k) =>
        setStep(k, { status: "error", detail: "Sem resposta do agente" }),
      );
    }

    const res = pingResult?.result ?? {};
    const errMsg = pingResult?.error_message;

    setStep("file_fdb", res.file_exists === true
      ? { status: "ok", detail: "Arquivo encontrado" }
      : res.file_exists === false
      ? { status: "error", detail: res.file_error ?? "Arquivo não encontrado",
          hint: "Confira DB_PATH no .env (caminho absoluto, ex.: C:\\Bancos\\dados.fdb). Caminhos UNC e drives mapeados costumam falhar como serviço." }
      : { status: "skip", detail: "Host remoto — verificação local pulada" });

    setStep("auth_sysdba", res.auth_ok === true
      ? { status: "ok", detail: "SYSDBA autenticou" }
      : res.auth_ok === false
      ? { status: "error", detail: res.auth_error, evidence: errMsg,
          hint: "Verifique DB_USER/DB_PASS no .env. Para Firebird 3+, usuário e senha são case-sensitive. Teste com isql: isql -u SYSDBA -p masterkey caminho.fdb" }
      : { status: pingResult ? "skip" : "error", detail: pingResult ? "Não verificada — banco inacessível antes" : "Sem resposta" });

    setStep("db_reach", res.db_reachable === true
      ? { status: "ok", detail: "Conexão Firebird estabelecida" }
      : res.db_reachable === false
      ? { status: "error", detail: res.db_error ?? errMsg ?? "Inacessível",
          hint: "Causas comuns: fbclient.dll com arquitetura diferente do Python (verificar 32/64 bits), versão errada do Firebird, charset incompatível (use WIN1252) ou banco em modo somente-leitura (gfix -mode read_write)." }
      : { status: "skip" });

    setStep("test_sql", res.test_query_ok === true
      ? { status: "ok", detail: "SELECT 1 retornou OK", ms: res.latency_ms }
      : res.test_query_ok === false
      ? { status: "error", detail: res.query_error,
          hint: "Banco conectou mas a query falhou. Pode indicar corrupção (gfix -v -full) ou bloqueio de tabela do sistema." }
      : { status: "skip" });

    // 4) Diagnóstico final
    const allSteps = await new Promise<Step[]>((resolve) => {
      setSteps((prev) => { resolve(prev); return prev; });
    });
    const firstError = allSteps.find((s) => s.status === "error");
    const ok = !firstError;
    const cause = firstError?.name;
    const latency = res.latency_ms ?? 0;
    setOverall({ ok, cause, latency });
    await persistResult(target, ok, latency, cause ?? null, errMsg ?? firstError?.detail ?? null);

    qc.invalidateQueries({ queryKey: ["agent_events", "connectivity_test"] });
    qc.invalidateQueries({ queryKey: ["databases"] });
    ok ? toast.success(`Diagnóstico OK — ${latency}ms`) : toast.error(`Falha em: ${cause}`);
    setRunning(false);
  }

  async function awaitWithTick(command_id: string, _hint: string) {
    const startTs = Date.now();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setWaitElapsed(Math.floor((Date.now() - startTs) / 1000)), 250);
    try {
      const row = await awaitCommandResult(command_id, { timeoutMs: TIMEOUT_SECONDS * 1000, intervalMs: 2000 });
      return row;
    } finally {
      if (tickRef.current) clearInterval(tickRef.current);
      setWaitElapsed(0);
    }
  }

  async function persistResult(
    database_id: string, ok: boolean, latency: number,
    step_failed: string | null, error_detail: string | null,
  ) {
    await supabase.from("agent_events").insert({
      database_id,
      event_type: "connectivity_test",
      latency_ms: latency,
      level: ok ? "success" : "error",
      step: ok ? null : step_failed,
      error_detail,
    });
    await supabase.from("databases").update({ status: ok ? "connected" : "disconnected" }).eq("id", database_id);
  }

  const selectedDb: any = databases.find((d: any) => d.id === target);
  const waitPct = Math.min(100, (waitElapsed / 30) * 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card className="p-5 bg-card border-border">
          <h3 className="font-mono text-sm font-semibold mb-1 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" /> Assistente de diagnóstico
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4">
            Verifica heartbeat, rede (DNS/HTTPS/porta 3050), arquivo .FDB, autenticação SYSDBA e query de teste — etapa por etapa.
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Selecione um banco para diagnosticar" /></SelectTrigger>
                <SelectContent>
                  {databases.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.companies?.name} · {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDb && (
                <p className="text-[10px] text-muted-foreground font-mono mt-1">
                  agent_uid: {selectedDb.agent_uid ?? "(não definido)"} · host: {selectedDb.host ?? "localhost"}:{selectedDb.port ?? 3050}
                </p>
              )}
            </div>
            <Button onClick={runDiagnostic} disabled={running || !target} className="w-full">
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Zap className="h-4 w-4 mr-1.5" />}
              {running ? "Diagnosticando…" : "Executar diagnóstico completo"}
            </Button>
          </div>

          {running && waitElapsed > 0 && (
            <div className="mt-4 p-3 rounded border border-dashed border-primary/40 bg-primary/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono">
                <Clock className="h-3.5 w-3.5 text-primary animate-pulse" />
                Aguardando agente buscar comando no heartbeat ({waitElapsed}s / {TIMEOUT_SECONDS}s)
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${waitPct}%` }} />
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div className="mt-5 space-y-2">
              {steps.map((s, i) => <StepRow key={s.key} s={s} idx={i} />)}
              {overall && (
                <div className={`mt-3 p-3 rounded border font-mono text-xs ${
                  overall.ok
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}>
                  <div className="font-semibold uppercase tracking-wider mb-1">
                    {overall.ok ? "DIAGNÓSTICO OK" : "FALHA DETECTADA"}
                  </div>
                  <div className="text-foreground/80">
                    {overall.ok
                      ? `Todas as etapas passaram. Latência do banco: ${overall.latency}ms.`
                      : `Causa: ${overall.cause}. Consulte a dica em destaque na etapa para corrigir.`}
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
                  <Badge variant={l.level === "success" ? "success" : l.level === "error" ? "destructive" : "muted"}>
                    {(l.level ?? "—").toString().toUpperCase()}
                  </Badge>
                  <span className="text-muted-foreground text-[10px]">{formatRelative(l.created_at)}</span>
                </div>
                <div className="text-foreground truncate">{l.databases?.name ?? "—"}</div>
                <div className="text-muted-foreground text-[10px]">
                  {l.latency_ms ?? 0}ms{l.step ? ` · falhou em ${l.step}` : ""}
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
