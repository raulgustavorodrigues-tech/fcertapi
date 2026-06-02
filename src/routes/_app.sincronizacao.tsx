import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, RefreshCw, Terminal, Server } from "lucide-react";
import { formatRelative } from "@/lib/format";

const REFRESH_MS = 30_000;

export const Route = createFileRoute("/_app/sincronizacao")({ component: Page });

function Page() {
  return (
    <Tabs defaultValue="monitor" className="space-y-4">
      <TabsList>
        <TabsTrigger value="monitor">Monitor em tempo real</TabsTrigger>
        <TabsTrigger value="historico" disabled>Histórico</TabsTrigger>
        <TabsTrigger value="schedules" disabled>Schedules</TabsTrigger>
        <TabsTrigger value="clientes" disabled>Clientes</TabsTrigger>
      </TabsList>
      <TabsContent value="monitor">
        <MonitorTab />
      </TabsContent>
    </Tabs>
  );
}

function MonitorTab() {
  const [tick, setTick] = useState(0); // refresh trigger
  const [elapsed, setElapsed] = useState(0); // ms since last refresh
  const [logsAgent, setLogsAgent] = useState<{ id: string; alias: string } | null>(null);

  // progress ring
  useEffect(() => {
    const start = Date.now();
    setElapsed(0);
    const t = setInterval(() => {
      const e = Date.now() - start;
      if (e >= REFRESH_MS) {
        setTick((x) => x + 1);
        clearInterval(t);
      } else {
        setElapsed(e);
      }
    }, 250);
    return () => clearInterval(t);
  }, [tick]);

  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ["agents-monitor", tick],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*, databases(name, company_id, companies(name))")
        .order("last_heartbeat_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const progress = Math.min(elapsed / REFRESH_MS, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Agentes ativos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Atualização automática a cada 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshRing progress={progress} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTick((x) => x + 1);
              refetch();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground bg-card border-border">
          Carregando agentes…
        </Card>
      ) : agents.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <Server className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-mono text-sm font-semibold">Nenhum agente registrado</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Aguardando primeiro heartbeat de um LocalBridge.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((a: any) => (
            <AgentCard
              key={a.id}
              agent={a}
              onViewLogs={() =>
                setLogsAgent({ id: a.id, alias: a.alias || a.agent_uid })
              }
            />
          ))}
        </div>
      )}

      <LogsSheet
        agent={logsAgent}
        onClose={() => setLogsAgent(null)}
      />
    </div>
  );
}

function RefreshRing({ progress }: { progress: number }) {
  const size = 32;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const remaining = Math.max(0, Math.ceil((1 - progress) * (REFRESH_MS / 1000)));
  return (
    <div className="flex items-center gap-2" title={`Próximo refresh em ${remaining}s`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
        {remaining}s
      </span>
    </div>
  );
}

function AgentCard({ agent, onViewLogs }: { agent: any; onViewLogs: () => void }) {
  const status = agent.status as string;
  const variant =
    status === "online" ? "success" : status === "syncing" ? "info" : status === "error" ? "error" : "secondary";

  const { data: history = [] } = useQuery({
    queryKey: ["agent-sync-history", agent.database_id],
    queryFn: async () => {
      if (!agent.database_id) return [];
      const { data } = await supabase
        .from("sync_logs")
        .select("started_at, records_count")
        .eq("database_id", agent.database_id)
        .order("started_at", { ascending: false })
        .limit(24);
      return (data ?? []).reverse();
    },
    enabled: !!agent.database_id,
  });

  return (
    <Card className="p-4 bg-card border-border space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${
              status === "online" ? "bg-success animate-pulse" :
              status === "syncing" ? "bg-info animate-pulse" :
              status === "error" ? "bg-destructive" : "bg-muted-foreground"
            }`} />
            <h3 className="font-mono text-sm font-semibold truncate">
              {agent.alias || agent.agent_uid}
            </h3>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {agent.databases?.companies?.name ?? "—"} · {agent.databases?.name ?? "sem banco"}
          </p>
        </div>
        <Badge variant={variant as any} className="shrink-0 text-[10px]">{status}</Badge>
      </div>

      <Sparkline data={history.map((h: any) => h.records_count ?? 0)} />

      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
        <Stat label="syncs" value={agent.total_syncs ?? 0} />
        <Stat label="versão" value={agent.agent_version ?? "—"} />
        <Stat label="heartbeat" value={formatRelative(agent.last_heartbeat_at)} />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-muted-foreground font-mono truncate">
          {agent.ip_address ?? "sem ip"}
        </span>
        <Button variant="outline" size="sm" onClick={onViewLogs}>
          <Terminal className="h-3.5 w-3.5 mr-1.5" /> Ver logs
        </Button>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-muted/30 rounded px-2 py-1">
      <div className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</div>
      <div className="truncate">{String(value)}</div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const width = 280;
  const height = 48;
  const pad = 2;

  if (data.length < 2) {
    return (
      <div className="h-12 flex items-center justify-center text-[10px] text-muted-foreground border border-dashed border-border rounded">
        sem histórico de sincronização
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = (width - pad * 2) / (data.length - 1);

  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${points[points.length - 1][0].toFixed(1)},${height - pad} L${points[0][0].toFixed(1)},${height - pad} Z`;
  const last = points[points.length - 1];

  return (
    <div className="rounded bg-muted/20 border border-border/50 p-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12" preserveAspectRatio="none">
        <path d={area} fill="hsl(var(--primary) / 0.15)" />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r={2.5} fill="hsl(var(--primary))" />
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-1">
        <span>{data.length} syncs</span>
        <span>último: {data[data.length - 1].toLocaleString("pt-BR")} regs</span>
      </div>
    </div>
  );
}

type LogLevel = "INFO" | "WARNING" | "ERROR";
type LogLine = { ts: string; level: LogLevel; msg: string };

function LogsSheet({
  agent,
  onClose,
}: {
  agent: { id: string; alias: string } | null;
  onClose: () => void;
}) {
  const open = !!agent;

  const logs = useMemo<LogLine[]>(() => {
    if (!agent) return [];
    return generateMockLogs(agent.id, 50);
  }, [agent]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl w-full p-0 flex flex-col bg-card border-border">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="font-mono text-sm flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            Logs · {agent?.alias}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Últimas 50 entradas em tempo real do agente.
          </SheetDescription>
        </SheetHeader>
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-black text-zinc-200 font-mono text-[12px] leading-relaxed p-3"
        >
          {logs.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              <span className="text-zinc-500">{l.ts}</span>{" "}
              <span className={levelClass(l.level)}>[{l.level}]</span>{" "}
              <span>{l.msg}</span>
            </div>
          ))}
          <div className="text-zinc-600 mt-2">— fim do buffer —</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function levelClass(level: LogLevel) {
  switch (level) {
    case "INFO": return "text-sky-400";
    case "WARNING": return "text-yellow-400";
    case "ERROR": return "text-red-400";
  }
}

function generateMockLogs(seed: string, count: number): LogLine[] {
  // Deterministic-ish mock based on agent id, since we don't persist agent logs.
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  const templates: { level: LogLevel; msg: string }[] = [
    { level: "INFO", msg: "Heartbeat enviado ao servidor (200 OK, 42ms)" },
    { level: "INFO", msg: "Conexão Firebird estabelecida em localhost:3050/DADOS.FDB" },
    { level: "INFO", msg: "Sync iniciado — tabela CLIENTES" },
    { level: "INFO", msg: "Sync concluído — 1.284 registros em 3.2s" },
    { level: "INFO", msg: "Query executada: SELECT * FROM PRODUTOS (210 rows, 88ms)" },
    { level: "WARNING", msg: "Latência alta detectada: 612ms (threshold 500ms)" },
    { level: "WARNING", msg: "Token de API renovado automaticamente" },
    { level: "WARNING", msg: "Tabela ESTOQUE com 0 alterações nas últimas 4h" },
    { level: "ERROR", msg: "Timeout ao conectar SYSDBA@localhost:3050 — retry em 30s" },
    { level: "ERROR", msg: "Falha SSL: certificado expirado em api.conecta.local" },
    { level: "INFO", msg: "Agente LocalBridge v1.4.2 inicializado" },
    { level: "INFO", msg: "Schedule disparado: sync_incremental every 5m" },
  ];

  const now = Date.now();
  const out: LogLine[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now - i * (15_000 + Math.floor(rand() * 90_000)));
    const tpl = templates[Math.floor(rand() * templates.length)];
    out.push({
      ts: t.toISOString().replace("T", " ").slice(0, 19),
      level: tpl.level,
      msg: tpl.msg,
    });
  }
  return out;
}
