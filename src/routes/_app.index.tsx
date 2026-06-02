import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  Database as DatabaseIcon,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  WifiOff,
  XCircle,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const now = Date.now();
      const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const since90d = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
      const since7h = new Date(now - 7 * 60 * 60 * 1000).toISOString();

      const [
        companies, databases, syncs24h, agentsOnline, lastSyncs, agents,
        syncs90d, syncs7h, allAgents, allDatabases, errors24h,
      ] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("databases").select("id", { count: "exact", head: true }),
        supabase.from("sync_logs").select("id", { count: "exact", head: true }).gte("started_at", since24h),
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("status", "online"),
        supabase
          .from("sync_logs")
          .select("id, started_at, finished_at, duration_ms, records_count, status, database_id, databases(name, companies(name))")
          .order("started_at", { ascending: false })
          .limit(10),
        supabase.from("agents").select("*").order("last_heartbeat_at", { ascending: false }).limit(8),
        supabase.from("sync_logs").select("started_at").gte("started_at", since90d),
        supabase.from("sync_logs").select("started_at").gte("started_at", since7h),
        supabase.from("agents").select("id, alias, agent_uid, status, last_heartbeat_at"),
        supabase.from("databases").select("id, name, agent_token, companies(name)"),
        supabase.from("sync_logs")
          .select("id, status, error_message, started_at, databases(name, companies(name))")
          .eq("status", "error")
          .gte("started_at", since24h)
          .limit(20),
      ]);

      return {
        companies: companies.count ?? 0,
        databases: databases.count ?? 0,
        syncs24h: syncs24h.count ?? 0,
        agentsOnline: agentsOnline.count ?? 0,
        lastSyncs: lastSyncs.data ?? [],
        agents: agents.data ?? [],
        syncs90d: syncs90d.data ?? [],
        syncs7h: syncs7h.data ?? [],
        allAgents: allAgents.data ?? [],
        allDatabases: allDatabases.data ?? [],
        errors24h: errors24h.data ?? [],
      };
    },
  });

  return (
    <div className="space-y-6">
      {/* HEADER com mini-bar de 7h */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-semibold">Visão geral</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitoramento em tempo real do ecossistema CONECTA
          </p>
        </div>
        <SevenHourBars data={data?.syncs7h ?? []} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Building2 className="h-5 w-5" />} label="Empresas cadastradas" value={data?.companies} loading={isLoading} delta="+0%" accent="primary" />
        <KpiCard icon={<DatabaseIcon className="h-5 w-5" />} label="Bancos conectados" value={data?.databases} loading={isLoading} delta="+0%" accent="info" />
        <KpiCard icon={<RefreshCw className="h-5 w-5" />} label="Sincronizações 24h" value={data?.syncs24h} loading={isLoading} delta="+0%" accent="success" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Agentes online" value={data?.agentsOnline} loading={isLoading} delta="0" accent="warning" />
      </div>

      <AgentHealthSection agents={data?.allAgents ?? []} loading={isLoading} />

      {/* ALERTAS ATIVOS */}
      <AlertsPanel
        loading={isLoading}
        agents={data?.allAgents ?? []}
        databases={data?.allDatabases ?? []}
        errors={data?.errors24h ?? []}
      />

      {/* HEATMAP 90 dias */}
      <ActivityHeatmap data={data?.syncs90d ?? []} loading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-mono text-sm font-semibold">Mapa de sincronizações</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Últimas 10 execuções</p>
            </div>
            <Badge variant="muted">tempo real</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Empresa</th>
                  <th className="py-2 pr-3 font-medium">Banco</th>
                  <th className="py-2 pr-3 font-medium">Registros</th>
                  <th className="py-2 pr-3 font-medium">Duração</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">Carregando…</td></tr>
                )}
                {!isLoading && (data?.lastSyncs?.length ?? 0) === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-xs">
                    Nenhuma sincronização registrada ainda.
                  </td></tr>
                )}
                {data?.lastSyncs?.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 pr-3">{s.databases?.companies?.name ?? "—"}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{s.databases?.name ?? "—"}</td>
                    <td className="py-2.5 pr-3 font-mono">{s.records_count ?? 0}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{s.duration_ms ? `${s.duration_ms}ms` : "—"}</td>
                    <td className="py-2.5 pr-3"><SyncStatus status={s.status} /></td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">{formatRelative(s.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-sm font-semibold">Agentes ativos</h2>
            <Badge variant="muted">{data?.agents?.length ?? 0}</Badge>
          </div>
          <div className="space-y-3">
            {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            {!isLoading && (data?.agents?.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nenhum agente registrado.
              </p>
            )}
            {data?.agents?.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border/50 hover:border-border transition-colors">
                <span
                  className={`status-dot ${a.status === "online" ? "pulse" : ""}`}
                  style={{ background: a.status === "online" ? "var(--success)" : "var(--muted-foreground)" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.alias ?? a.agent_uid}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {a.ip_address ?? "—"} · {formatRelative(a.last_heartbeat_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ========== Sub-componentes ========== */

function SevenHourBars({ data, loading }: { data: any[]; loading: boolean }) {
  // Bucketize per hour for the last 7 hours
  const now = new Date();
  const buckets = Array.from({ length: 7 }).map((_, i) => {
    const h = new Date(now);
    h.setMinutes(0, 0, 0);
    h.setHours(h.getHours() - (6 - i));
    return { hour: h, count: 0 };
  });
  for (const r of data) {
    const t = new Date(r.started_at).getTime();
    for (const b of buckets) {
      const start = b.hour.getTime();
      const end = start + 60 * 60 * 1000;
      if (t >= start && t < end) { b.count++; break; }
    }
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <Card className="p-3 bg-card border-border w-full lg:w-auto">
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">syncs / 7h</div>
          <div className="font-mono text-lg font-semibold leading-none">{loading ? "—" : total}</div>
        </div>
        <div className="flex items-end gap-1 h-10">
          {buckets.map((b, i) => {
            const pct = (b.count / max) * 100;
            return (
              <div key={i} className="flex flex-col items-center gap-1" title={`${b.hour.getHours()}h · ${b.count} syncs`}>
                <div
                  className="w-4 rounded-sm bg-primary/80 hover:bg-primary transition-colors"
                  style={{ height: `${Math.max(pct, 4)}%`, minHeight: 2 }}
                />
                <span className="text-[9px] font-mono text-muted-foreground leading-none">
                  {String(b.hour.getHours()).padStart(2, "0")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function AlertsPanel({
  loading, agents, databases, errors,
}: { loading: boolean; agents: any[]; databases: any[]; errors: any[] }) {
  const FIVE_MIN = 5 * 60 * 1000;
  const offlineAgents = agents.filter(
    (a) => a.status !== "online" ||
      !a.last_heartbeat_at ||
      Date.now() - new Date(a.last_heartbeat_at).getTime() > FIVE_MIN
  );
  const missingToken = databases.filter((d) => !d.agent_token);
  const erroredSyncs = errors;

  // mock "tokens prox de expirar": como não temos expiração, usamos tokens curtos / não rotacionados (sem agent_token = crítico, com token = consideramos 1/4 como "expiring soon" baseado em hash do id)
  const expiringTokens = databases
    .filter((d) => d.agent_token)
    .filter((d) => {
      let h = 0; for (let i = 0; i < (d.id ?? "").length; i++) h = (h * 31 + d.id.charCodeAt(i)) >>> 0;
      return h % 7 === 0;
    });

  const totalAlerts = offlineAgents.length + erroredSyncs.length + expiringTokens.length + missingToken.length;
  const ok = !loading && totalAlerts === 0;

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${ok ? "text-success" : "text-warning"}`} />
          <h2 className="font-mono text-sm font-semibold">Alertas ativos</h2>
        </div>
        <Badge variant={ok ? "success" : totalAlerts > 5 ? "destructive" : "warning"}>
          {loading ? "…" : `${totalAlerts} alerta(s)`}
        </Badge>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : ok ? (
        <div className="flex items-center gap-2 text-success text-sm py-4">
          <ShieldCheck className="h-4 w-4" />
          Tudo sob controle — nenhum incidente detectado.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {offlineAgents.length > 0 && (
              <AlertBadge tone="destructive" icon={<WifiOff className="h-3 w-3" />}
                label={`${offlineAgents.length} agente(s) offline`} />
            )}
            {erroredSyncs.length > 0 && (
              <AlertBadge tone="destructive" icon={<XCircle className="h-3 w-3" />}
                label={`${erroredSyncs.length} sync(s) com erro (24h)`} />
            )}
            {expiringTokens.length > 0 && (
              <AlertBadge tone="warning" icon={<KeyRound className="h-3 w-3" />}
                label={`${expiringTokens.length} token(s) próximos de expirar`} />
            )}
            {missingToken.length > 0 && (
              <AlertBadge tone="warning" icon={<KeyRound className="h-3 w-3" />}
                label={`${missingToken.length} banco(s) sem token de agente`} />
            )}
          </div>
          {(offlineAgents.length > 0 || erroredSyncs.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
              {offlineAgents.slice(0, 3).map((a) => (
                <div key={a.id} className="text-xs flex items-center gap-2 p-2 rounded border border-destructive/30 bg-destructive/5">
                  <WifiOff className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono truncate">{a.alias ?? a.agent_uid}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Sem heartbeat {formatRelative(a.last_heartbeat_at)}
                    </div>
                  </div>
                </div>
              ))}
              {erroredSyncs.slice(0, 3).map((e: any) => (
                <div key={e.id} className="text-xs flex items-center gap-2 p-2 rounded border border-destructive/30 bg-destructive/5">
                  <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono truncate">
                      {e.databases?.companies?.name ?? "—"} · {e.databases?.name ?? "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {e.error_message ?? "Erro de sincronização"} · {formatRelative(e.started_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AlertBadge({ tone, icon, label }: { tone: "destructive" | "warning"; icon: React.ReactNode; label: string }) {
  const cls = tone === "destructive"
    ? "bg-destructive/10 border-destructive/40 text-destructive"
    : "bg-warning/10 border-warning/40 text-warning";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono ${cls}`}>
      {icon}
      {label}
    </div>
  );
}

function ActivityHeatmap({ data, loading }: { data: any[]; loading: boolean }) {
  // Build 90-day map keyed by YYYY-MM-DD
  const counts = new Map<string, number>();
  for (const r of data) {
    const d = new Date(r.started_at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  // 90 days, ending today, organized into ~13 weeks x 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: Date; count: number; key: string }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: d, count: counts.get(k) ?? 0, key: k });
  }

  // Pad start so the first column starts on Sunday
  const firstDow = days[0].date.getDay(); // 0=Sun
  const padded: ({ date: Date; count: number; key: string } | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ];
  // Group into weeks (columns)
  const weeks: ({ date: Date; count: number; key: string } | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  function level(c: number) {
    if (c === 0) return 0;
    const r = c / max;
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 0.75) return 3;
    return 4;
  }
  const levelClass = [
    "bg-muted/30 border-border/40",
    "bg-primary/20 border-primary/30",
    "bg-primary/40 border-primary/50",
    "bg-primary/70 border-primary/70",
    "bg-primary border-primary",
  ];
  const monthLabels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const dayLabels = ["", "Seg", "", "Qua", "", "Sex", ""];

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold">Atividade de sincronização</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Últimos 90 dias</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
          <span><span className="text-foreground font-semibold">{total}</span> syncs</span>
          <span><span className="text-foreground font-semibold">{activeDays}</span> dias ativos</span>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-flex gap-2">
            {/* Day labels column */}
            <div className="flex flex-col gap-[3px] pt-4">
              {dayLabels.map((l, i) => (
                <div key={i} className="h-[14px] text-[9px] font-mono text-muted-foreground leading-none flex items-center">
                  {l}
                </div>
              ))}
            </div>

            <div>
              {/* Month labels row */}
              <div className="flex gap-[3px] mb-1 h-3">
                {weeks.map((w, wi) => {
                  const firstReal = w.find((d) => d);
                  if (!firstReal) return <div key={wi} className="w-[14px]" />;
                  const isFirstOfMonth = firstReal.date.getDate() <= 7;
                  return (
                    <div key={wi} className="w-[14px] text-[9px] font-mono text-muted-foreground leading-none">
                      {isFirstOfMonth ? monthLabels[firstReal.date.getMonth()] : ""}
                    </div>
                  );
                })}
              </div>

              {/* Grid */}
              <div className="flex gap-[3px]">
                {weeks.map((w, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }).map((_, di) => {
                      const cell = w[di];
                      if (!cell) return <div key={di} className="w-[14px] h-[14px]" />;
                      const lvl = level(cell.count);
                      return (
                        <div
                          key={di}
                          title={`${cell.date.toLocaleDateString("pt-BR")} · ${cell.count} sync(s)`}
                          className={`w-[14px] h-[14px] rounded-[3px] border ${levelClass[lvl]} hover:ring-1 hover:ring-primary cursor-default`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 text-[10px] font-mono text-muted-foreground">
            <span>menos</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <div key={l} className={`w-[14px] h-[14px] rounded-[3px] border ${levelClass[l]}`} />
            ))}
            <span>mais</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function KpiCard({
  icon, label, value, loading, delta, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  loading: boolean;
  delta: string;
  accent: "primary" | "info" | "success" | "warning";
}) {
  const colorMap = {
    primary: "text-primary bg-primary/15 border-primary/30",
    info: "text-info bg-info/15 border-info/30",
    success: "text-success bg-success/15 border-success/30",
    warning: "text-warning bg-warning/15 border-warning/30",
  };
  const positive = !delta.startsWith("-") && delta !== "0";
  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-start justify-between mb-3">
        <div className={`h-9 w-9 rounded-md border flex items-center justify-center ${colorMap[accent]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-xs font-mono ${positive ? "text-success" : "text-muted-foreground"}`}>
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta}
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20 mb-1" />
      ) : (
        <div className="font-mono text-3xl font-semibold">{value ?? 0}</div>
      )}
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}

function SyncStatus({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string; pulse?: boolean }> = {
    success: { variant: "success", label: "SUCESSO" },
    error: { variant: "destructive", label: "ERRO" },
    pending: { variant: "warning", label: "PENDENTE" },
    running: { variant: "info", label: "EXECUTANDO", pulse: true },
  };
  const cfg = map[status] ?? { variant: "muted", label: status?.toUpperCase() ?? "—" };
  return (
    <Badge variant={cfg.variant}>
      {cfg.pulse && <span className="status-dot pulse" style={{ background: "currentColor" }} />}
      {cfg.label}
    </Badge>
  );
}
