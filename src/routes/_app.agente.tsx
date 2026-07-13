import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, CheckCircle2, Copy, Download, HeartPulse, Loader2, Server,
  Terminal, WifiOff, XCircle, AlertTriangle, RefreshCw,
} from "lucide-react";
import { formatRelative, formatDateTime } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/agente")({ component: AgentePage });

const ONLINE_MS = 90_000; // heartbeat considerado ativo até 90s

function statusOf(lastHb: string | null): "online" | "stale" | "offline" {
  if (!lastHb) return "offline";
  const diff = Date.now() - new Date(lastHb).getTime();
  if (diff < ONLINE_MS) return "online";
  if (diff < ONLINE_MS * 4) return "stale";
  return "offline";
}

function StatusDot({ s }: { s: "online" | "stale" | "offline" }) {
  const color =
    s === "online" ? "bg-success" : s === "stale" ? "bg-warning" : "bg-destructive";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color} ${s === "online" ? "animate-pulse" : ""}`} />
      <span className="text-[10px] uppercase font-mono text-muted-foreground">
        {s === "online" ? "online" : s === "stale" ? "instável" : "offline"}
      </span>
    </span>
  );
}

function AgentePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xl font-semibold">Agente FireSync</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Instalação, status ao vivo e diagnóstico do agente Windows.
        </p>
      </div>

      <Tabs defaultValue="instrucoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="instrucoes">Instruções</TabsTrigger>
          <TabsTrigger value="status">Status ao vivo</TabsTrigger>
          <TabsTrigger value="logs">Logs de diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="instrucoes"><InstructionsTab /></TabsContent>
        <TabsContent value="status"><LiveStatusTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------- Instruções ------------------------- */

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative group">
      <pre className="bg-muted/40 border border-border rounded-md p-3 text-[11px] font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap">
{children}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={() => {
          navigator.clipboard.writeText(children);
          toast.success("Copiado");
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 h-7 w-7 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center text-primary font-mono text-xs">
        {n}
      </div>
      <div className="flex-1 space-y-2">
        <div className="font-mono text-sm text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

function InstructionsTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm font-semibold">Instalação padrão (recomendado)</h2>
        </div>

        <Step n={1} title="Baixe o instalador do banco">
          Vá em <b>Bancos de Dados</b>, encontre o banco desejado e clique em{" "}
          <b>Baixar instalador</b>. O ZIP inclui <code>install.bat</code>,{" "}
          <code>firesync-agent.env</code> (com <code>agent_token</code> e{" "}
          <code>database_id</code> já preenchidos) e <code>LEIA-ME.txt</code>.
        </Step>

        <Step n={2} title="Descompacte na máquina Windows">
          Extraia o ZIP em uma pasta local (ex.: <code>C:\FireSync\</code>).
          Mantenha os três arquivos juntos.
        </Step>

        <Step n={3} title="Execute como Administrador">
          Clique com o botão direito em <code>install.bat</code> e escolha{" "}
          <b>Executar como administrador</b>. O script vai baixar o{" "}
          <code>firesync-agent-setup.exe</code> do Hub, instalar em{" "}
          <code>C:\Program Files\FireSync\</code> e registrar o serviço.
        </Step>

        <Step n={4} title="Verifique o serviço FireSyncAgent">
          Abra <b>cmd</b> como administrador e rode:
          <CodeBlock>{`sc query FireSyncAgent`}</CodeBlock>
          O estado deve ser <b>RUNNING</b>. Caso contrário:
          <CodeBlock>{`sc start FireSyncAgent`}</CodeBlock>
        </Step>

        <Step n={5} title="Confirme o registro">
          Volte para esta tela na aba <b>Status ao vivo</b>. Em até 30 segundos
          o agente deve aparecer como <b>online</b>. O primeiro heartbeat
          cria a linha em <code>agents</code> automaticamente.
        </Step>
      </Card>

      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm font-semibold">Alternativa manual (run.bat + NSSM)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Use quando o serviço Windows nativo não puder ser instalado (ex.:
          política de grupo). Requer <a href="https://nssm.cc/download" target="_blank" rel="noreferrer" className="text-primary underline">NSSM</a>.
        </p>

        <Step n={1} title="Prepare a pasta">
          Extraia <code>firesync-agent.exe</code> e <code>firesync-agent.env</code> em{" "}
          <code>C:\FireSync\</code>. Crie <code>run.bat</code> ao lado:
          <CodeBlock>{`@echo off
cd /d "%~dp0"
firesync-agent.exe --run`}</CodeBlock>
        </Step>

        <Step n={2} title="Registre com NSSM">
          Baixe o NSSM, extraia e rode (como Administrador):
          <CodeBlock>{`nssm install FireSyncAgent "C:\\FireSync\\run.bat"
nssm set     FireSyncAgent AppDirectory "C:\\FireSync"
nssm set     FireSyncAgent Start SERVICE_AUTO_START
nssm set     FireSyncAgent AppStdout "C:\\ProgramData\\FireSync\\logs\\stdout.log"
nssm set     FireSyncAgent AppStderr "C:\\ProgramData\\FireSync\\logs\\stderr.log"
nssm start   FireSyncAgent`}</CodeBlock>
        </Step>

        <Step n={3} title="Comandos úteis do serviço">
          <CodeBlock>{`sc query   FireSyncAgent      :: status
sc stop    FireSyncAgent      :: para
sc start   FireSyncAgent      :: inicia
nssm restart FireSyncAgent    :: reinicia via NSSM
nssm remove  FireSyncAgent confirm  :: desinstala`}</CodeBlock>
        </Step>

        <Step n={4} title="Onde estão os logs?">
          Log do agente:
          <CodeBlock>{`C:\\ProgramData\\FireSync\\logs\\firesync-agent.log`}</CodeBlock>
          Logs do NSSM (stdout/stderr) também vão para essa pasta.
        </Step>

        <Step n={5} title="Alterei o .env, e agora?">
          Depois de editar <code>firesync-agent.env</code>, reinicie o serviço:
          <CodeBlock>{`sc stop FireSyncAgent && sc start FireSyncAgent`}</CodeBlock>
        </Step>
      </Card>
    </div>
  );
}

/* ------------------------- Status ao vivo ------------------------- */

function LiveStatusTab() {
  const qc = useQueryClient();
  const [_, setNowTick] = useState(0);

  // Re-render a cada 10s para atualizar "online/stale/offline" com base no relógio
  useEffect(() => {
    const t = setInterval(() => setNowTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["agents-live"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, agent_uid, alias, status, last_heartbeat_at, first_seen_at, agent_version, tunnel_url, system_info, database_id, databases(name, companies(name))")
        .order("last_heartbeat_at", { ascending: false, nullsFirst: false });
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // Realtime: qualquer INSERT/UPDATE em agents invalida a query
  useEffect(() => {
    const ch = supabase
      .channel("agents-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents" },
        () => qc.invalidateQueries({ queryKey: ["agents-live"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const counts = useMemo(() => {
    const c = { online: 0, stale: 0, offline: 0 };
    (data ?? []).forEach((a) => { c[statusOf(a.last_heartbeat_at)]++; });
    return c;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-success/15 border border-success/30 flex items-center justify-center">
            <HeartPulse className="h-4 w-4 text-success" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase font-mono">online</div>
            <div className="text-2xl font-mono font-semibold text-success">{counts.online}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-warning/15 border border-warning/30 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase font-mono">instável</div>
            <div className="text-2xl font-mono font-semibold text-warning">{counts.stale}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-destructive/15 border border-destructive/30 flex items-center justify-center">
            <WifiOff className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase font-mono">offline</div>
            <div className="text-2xl font-mono font-semibold text-destructive">{counts.offline}</div>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-mono text-sm font-semibold">Agentes conectados</h3>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            atualiza em tempo real via realtime
          </span>
        </div>

        {isLoading ? (
          <div className="p-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando agentes…
          </div>
        ) : (data ?? []).length === 0 ? (
          <EmptyAgents />
        ) : (
          <div className="divide-y divide-border">
            {(data ?? []).map((a) => {
              const s = statusOf(a.last_heartbeat_at);
              const waiting = !a.last_heartbeat_at;
              return (
                <div key={a.id} className="p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors">
                  <div className="h-10 w-10 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Server className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-foreground truncate">
                        {a.alias || a.agent_uid}
                      </span>
                      <StatusDot s={s} />
                      {a.agent_version && (
                        <Badge variant="muted" className="text-[9px]">v{a.agent_version}</Badge>
                      )}
                      {a.tunnel_url && (
                        <Badge variant="muted" className="text-[9px]">tunnel</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                      {(a as any).databases?.companies?.name ?? "—"} · {(a as any).databases?.name ?? "—"} · uid: {a.agent_uid}
                    </div>
                  </div>
                  <div className="text-right text-[11px] font-mono">
                    {waiting ? (
                      <span className="inline-flex items-center gap-1.5 text-warning">
                        <Loader2 className="h-3 w-3 animate-spin" /> aguardando 1º heartbeat
                      </span>
                    ) : (
                      <>
                        <div className="text-muted-foreground">último heartbeat</div>
                        <div className="text-foreground">{formatRelative(a.last_heartbeat_at)}</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function EmptyAgents() {
  return (
    <div className="p-8 text-center space-y-3">
      <WifiOff className="h-8 w-8 text-muted-foreground mx-auto" />
      <div className="font-mono text-sm text-foreground">Nenhum agente registrado ainda</div>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        Baixe o instalador de um banco na aba <b>Bancos de Dados</b> e execute
        na máquina do cliente. O primeiro <code>heartbeat</code> registra o
        agente automaticamente aqui.
      </p>
    </div>
  );
}

/* ------------------------- Logs / Diagnóstico ------------------------- */

function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    DEBUG: "bg-muted/40 text-muted-foreground",
    INFO: "bg-primary/10 text-primary border-primary/30",
    WARNING: "bg-warning/10 text-warning border-warning/30",
    ERROR: "bg-destructive/10 text-destructive border-destructive/30",
    CRITICAL: "bg-destructive/20 text-destructive border-destructive/40",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border border-transparent ${map[level] ?? map.INFO}`}>
      {level}
    </span>
  );
}

function LogsTab() {
  const qc = useQueryClient();
  const [level, setLevel] = useState<"ALL" | "INFO" | "WARNING" | "ERROR">("ALL");

  const events = useQuery({
    queryKey: ["agent-events-diag", level],
    queryFn: async () => {
      let q = supabase
        .from("agent_events")
        .select("id, created_at, level, event_type, message, context, agent_id, database_id, databases(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (level !== "ALL") q = q.eq("level", level);
      const { data } = await q;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const results = useQuery({
    queryKey: ["command-results-diag"],
    queryFn: async () => {
      const { data } = await supabase
        .from("command_results")
        .select("id, command_id, command_type, status, enqueued_at, picked_up_at, completed_at, duration_ms, error_message, result, payload, database_id, databases(name)")
        .order("enqueued_at", { ascending: false })
        .limit(80);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("logs-diag")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_events" },
        () => qc.invalidateQueries({ queryKey: ["agent-events-diag"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "command_results" },
        () => qc.invalidateQueries({ queryKey: ["command-results-diag"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <h3 className="font-mono text-sm font-semibold">agent-report · eventos</h3>
          </div>
          <div className="flex items-center gap-1">
            {(["ALL", "INFO", "WARNING", "ERROR"] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                variant={level === l ? "default" : "ghost"}
                className="h-6 px-2 text-[10px] font-mono"
                onClick={() => setLevel(l)}
              >
                {l}
              </Button>
            ))}
            <Button size="icon" variant="ghost" className="h-6 w-6"
              onClick={() => qc.invalidateQueries({ queryKey: ["agent-events-diag"] })}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <ScrollArea className="h-[520px]">
          {events.isLoading ? (
            <div className="p-4 text-xs text-muted-foreground">Carregando…</div>
          ) : (events.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhum evento no filtro atual.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(events.data ?? []).map((e) => (
                <details key={e.id} className="p-3 text-[11px] font-mono">
                  <summary className="flex items-center gap-2 cursor-pointer">
                    <LevelBadge level={e.level ?? "INFO"} />
                    <span className="text-muted-foreground">{formatDateTime(e.created_at)}</span>
                    <span className="text-foreground/80 truncate flex-1">{e.message}</span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                      {(e as any).databases?.name ?? "—"}
                    </span>
                  </summary>
                  {e.context && (
                    <pre className="mt-2 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto">
{JSON.stringify(e.context, null, 2)}
                    </pre>
                  )}
                </details>
              ))}
            </div>
          )}
        </ScrollArea>
      </Card>

      <Card className="p-0 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-mono text-sm font-semibold">command_results · execuções</h3>
          </div>
          <Button size="icon" variant="ghost" className="h-6 w-6"
            onClick={() => qc.invalidateQueries({ queryKey: ["command-results-diag"] })}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <ScrollArea className="h-[520px]">
          {results.isLoading ? (
            <div className="p-4 text-xs text-muted-foreground">Carregando…</div>
          ) : (results.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhum comando executado ainda.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(results.data ?? []).map((r) => {
                const okIcon =
                  r.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> :
                  r.status === "error" || r.status === "timeout" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
                  r.status === "processing" ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" /> :
                  <Loader2 className="h-3.5 w-3.5 text-muted-foreground" />;
                return (
                  <details key={r.id} className="p-3 text-[11px] font-mono">
                    <summary className="flex items-center gap-2 cursor-pointer">
                      {okIcon}
                      <Badge variant="muted" className="text-[9px]">{r.command_type}</Badge>
                      <span className="text-foreground/80 truncate flex-1">{r.command_id}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {r.duration_ms ? `${r.duration_ms}ms` : formatRelative(r.enqueued_at)}
                      </span>
                    </summary>
                    <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                      <div>banco: <span className="text-foreground">{(r as any).databases?.name ?? "—"}</span></div>
                      <div>status: <span className="text-foreground">{r.status}</span></div>
                      <div>enqueued: {formatDateTime(r.enqueued_at)}</div>
                      {r.picked_up_at && <div>picked_up: {formatDateTime(r.picked_up_at)}</div>}
                      {r.completed_at && <div>completed: {formatDateTime(r.completed_at)}</div>}
                      {r.error_message && (
                        <div className="text-destructive break-words">✖ {r.error_message}</div>
                      )}
                      {r.payload && (
                        <details>
                          <summary className="cursor-pointer">payload</summary>
                          <pre className="mt-1 p-2 bg-muted/30 rounded overflow-x-auto">
{JSON.stringify(r.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                      {r.result && (
                        <details>
                          <summary className="cursor-pointer">result</summary>
                          <pre className="mt-1 p-2 bg-muted/30 rounded overflow-x-auto">
{JSON.stringify(r.result, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}
