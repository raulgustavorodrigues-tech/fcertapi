import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Database as DatabaseIcon, RefreshCw, Activity, TrendingUp,
  AlertTriangle, WifiOff, XCircle, KeyRound, ShieldCheck, Wifi, Clock,
  HeartPulse, Zap, CheckCircle2, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { BrazilAgentsMap } from "@/components/conecta/BrazilAgentsMap";


export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard · CONECTA API" },
      { name: "description", content: "Monitoramento em tempo real de agentes, sincronizações e falhas do ecossistema CONECTA." },
      { property: "og:title", content: "Dashboard · CONECTA API" },
      { property: "og:description", content: "Painel operacional com telemetria ao vivo de agentes FireSync." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/* --------------------------------- helpers -------------------------------- */

const ONE_MIN = 60_000;
const FIVE_MIN = 5 * ONE_MIN;

function useNowTick(ms = 15_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function useCountUp(target: number | undefined, duration = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    const from = 0;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

/* -------------------------------- component ------------------------------- */

function DashboardPage() {
  useNowTick(15_000);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const now = Date.now();
      const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const since90d = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
      const since7h = new Date(now - 7 * 60 * 60 * 1000).toISOString();

      const [
        companies, databases, syncs24h, agentsOnline, lastSyncs, agents,
        syncs90d, syncs7h, allAgents, allDatabases, errors24h, syncs24hDetail,
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
        supabase.from("agents").select("id, alias, agent_uid, status, last_heartbeat_at, system_info, pending_commands, database_id, databases(name, companies(name, state))"),
        supabase.from("databases").select("id, name, agent_token, companies(name)"),
        supabase.from("sync_logs")
          .select("id, status, error_message, started_at, databases(name, companies(name))")
          .eq("status", "error")
          .gte("started_at", since24h)
          .limit(50),
        supabase.from("sync_logs").select("started_at, status, records_count").gte("started_at", since24h),
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
        syncs24hDetail: syncs24hDetail.data ?? [],
      };
    },
  });

  return (
    <div className="space-y-6 relative">
      {/* Ambient gradient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-20 h-[520px] w-[520px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-20 right-0 h-[420px] w-[420px] rounded-full bg-secondary/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-info/5 blur-[120px]" />
      </div>

      <HeroBar
        loading={isLoading}
        dataUpdatedAt={dataUpdatedAt}
        agentsOnline={data?.agentsOnline ?? 0}
        totalAgents={data?.allAgents?.length ?? 0}
        syncs24h={data?.syncs24h ?? 0}
        errors24h={data?.errors24h?.length ?? 0}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Building2 className="h-5 w-5" />} label="Empresas" value={data?.companies} loading={isLoading} accent="primary" hint="cadastradas no hub" />
        <KpiCard icon={<DatabaseIcon className="h-5 w-5" />} label="Bancos conectados" value={data?.databases} loading={isLoading} accent="info" hint="Firebird gerenciados" />
        <KpiCard icon={<RefreshCw className="h-5 w-5" />} label="Syncs 24h" value={data?.syncs24h} loading={isLoading} accent="success" hint="execuções nas últimas 24h" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Agentes online" value={data?.agentsOnline} loading={isLoading} accent="warning" hint="heartbeat < 60s" live />
      </div>

      {/* MAIN CHART ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SyncsTimelineCard data={data?.syncs24hDetail ?? []} loading={isLoading} />
        <AgentDonutCard agents={data?.allAgents ?? []} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BrazilAgentsMap agents={data?.allAgents ?? []} loading={isLoading} />
        <div className="lg:col-span-1 space-y-4">
          <AgentHealthSection agents={data?.allAgents ?? []} loading={isLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <FailuresBarCard errors={data?.errors24h ?? []} loading={isLoading} />
        <AgentDonutCard agents={data?.allAgents ?? []} loading={isLoading} />
      </div>


      <AlertsPanel
        loading={isLoading}
        agents={data?.allAgents ?? []}
        databases={data?.allDatabases ?? []}
        errors={data?.errors24h ?? []}
      />

      <ActivityHeatmap data={data?.syncs90d ?? []} loading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 bg-card/60 border-border backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-mono text-sm font-semibold flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-primary animate-pulse" />
                Mapa de sincronizações
              </h2>
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

        <Card className="p-5 bg-card/60 border-border backdrop-blur-sm">
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
            {data?.agents?.map((a: any) => {
              const online = a.status === "online";
              return (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border/50 hover:border-primary/40 hover:bg-primary/[0.03] transition-all">
                  <span className="relative flex h-2.5 w-2.5">
                    {online && <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />}
                    <span
                      className="relative inline-flex rounded-full h-2.5 w-2.5"
                      style={{ background: online ? "var(--success)" : "var(--muted-foreground)" }}
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{a.alias ?? a.agent_uid}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      {a.ip_address ?? "—"} · {formatRelative(a.last_heartbeat_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------- HERO ----------------------------------- */

function HeroBar({
  loading, dataUpdatedAt, agentsOnline, totalAgents, syncs24h, errors24h,
}: {
  loading: boolean; dataUpdatedAt: number;
  agentsOnline: number; totalAgents: number; syncs24h: number; errors24h: number;
}) {
  const successRate = syncs24h > 0
    ? Math.max(0, Math.min(100, Math.round(((syncs24h - errors24h) / syncs24h) * 100)))
    : 100;
  const uptime = totalAgents > 0 ? Math.round((agentsOnline / totalAgents) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-sm">
      {/* animated grid backdrop */}
      <div aria-hidden className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(ellipse at top left, black 30%, transparent 75%)",
        }}
      />
      <div aria-hidden className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-70 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">
              live · atualizado {formatRelative(new Date(dataUpdatedAt).toISOString())}
            </span>
          </div>
          <h1 className="font-mono text-2xl lg:text-3xl font-semibold tracking-tight">
            Centro de Operações <span className="text-primary">FireSync</span>
          </h1>
          <p className="text-xs lg:text-sm text-muted-foreground mt-1.5 max-w-xl">
            Telemetria em tempo real do ecossistema CONECTA — agentes, sincronizações,
            filas e incidentes em uma única superfície.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:min-w-[420px]">
          <RingStat label="Taxa de sucesso" value={successRate} suffix="%" tone="success" loading={loading} />
          <RingStat label="Agentes conectados" value={uptime} suffix="%" tone="primary" loading={loading} sub={`${agentsOnline}/${totalAgents}`} />
          <RingStat label="Falhas 24h" value={errors24h} tone={errors24h === 0 ? "success" : errors24h > 5 ? "destructive" : "warning"} loading={loading} raw />
        </div>
      </div>
    </div>
  );
}

function RingStat({
  label, value, suffix, tone, loading, sub, raw,
}: {
  label: string; value: number; suffix?: string;
  tone: "primary" | "success" | "warning" | "destructive";
  loading: boolean; sub?: string; raw?: boolean;
}) {
  const shown = useCountUp(value, 900);
  const pct = raw ? Math.min(100, value * 10) : shown;
  const color = `var(--${tone})`;
  const dash = 2 * Math.PI * 22;
  const off = dash - (Math.min(100, pct) / 100) * dash;

  return (
    <div className="relative rounded-lg border border-border/70 bg-background/40 backdrop-blur-sm p-3 flex items-center gap-3">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 50 50" className="h-14 w-14 -rotate-90">
          <circle cx="25" cy="25" r="22" fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="25" cy="25" r="22" fill="none" stroke={color} strokeWidth="4"
            strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold" style={{ color }}>
          {loading ? "…" : `${raw ? value : shown}${suffix ?? ""}`}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono truncate">{label}</div>
        {sub && <div className="text-[11px] font-mono text-foreground/80 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- KPI ------------------------------------ */

function KpiCard({
  icon, label, value, loading, accent, hint, live,
}: {
  icon: React.ReactNode; label: string; value: number | undefined; loading: boolean;
  accent: "primary" | "info" | "success" | "warning"; hint?: string; live?: boolean;
}) {
  const shown = useCountUp(value ?? 0);
  const colorMap = {
    primary: "text-primary bg-primary/15 border-primary/30",
    info: "text-info bg-info/15 border-info/30",
    success: "text-success bg-success/15 border-success/30",
    warning: "text-warning bg-warning/15 border-warning/30",
  } as const;
  const glow = {
    primary: "shadow-[0_0_40px_-15px_var(--primary)]",
    info: "shadow-[0_0_40px_-15px_var(--info)]",
    success: "shadow-[0_0_40px_-15px_var(--success)]",
    warning: "shadow-[0_0_40px_-15px_var(--warning)]",
  } as const;

  return (
    <Card className={`group relative overflow-hidden p-5 bg-card/60 border-border backdrop-blur-sm hover:border-primary/40 transition-all duration-300 ${glow[accent]}`}>
      <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: `var(--${accent})` }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className={`h-9 w-9 rounded-md border flex items-center justify-center ${colorMap[accent]}`}>
            {icon}
          </div>
          {live && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> live
            </span>
          )}
        </div>
        {loading ? (
          <Skeleton className="h-9 w-24 mb-1" />
        ) : (
          <div className="font-mono text-3xl font-semibold tabular-nums">{shown.toLocaleString("pt-BR")}</div>
        )}
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground/70 font-mono mt-1">{hint}</div>}
      </div>
    </Card>
  );
}

/* ---------------------------- CHART: TIMELINE ----------------------------- */

function SyncsTimelineCard({ data, loading }: { data: any[]; loading: boolean }) {
  const series = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 24 }).map((_, i) => {
      const d = new Date(now);
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() - (23 - i));
      return { t: d, hour: d.getHours(), success: 0, error: 0, total: 0 };
    });
    for (const r of data) {
      const t = new Date(r.started_at).getTime();
      for (const b of buckets) {
        const s = b.t.getTime();
        if (t >= s && t < s + 3600_000) {
          if (r.status === "error") b.error++;
          else b.success++;
          b.total++;
          break;
        }
      }
    }
    return buckets.map((b) => ({
      label: `${String(b.hour).padStart(2, "0")}h`,
      success: b.success,
      error: b.error,
    }));
  }, [data]);

  const totalSuccess = series.reduce((a, b) => a + b.success, 0);
  const totalError = series.reduce((a, b) => a + b.error, 0);

  return (
    <Card className="lg:col-span-2 p-5 bg-card/60 border-border backdrop-blur-sm">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-mono text-sm font-semibold flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Fluxo de sincronizações
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Últimas 24 horas · agrupado por hora</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            sucesso <span className="text-foreground font-semibold">{totalSuccess}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            erro <span className="text-foreground font-semibold">{totalError}</span>
          </span>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradSuccess" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradError" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={2} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }}
                contentStyle={{
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)",
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
              />
              <Area type="monotone" dataKey="success" stroke="var(--primary)" strokeWidth={2} fill="url(#gradSuccess)" />
              <Area type="monotone" dataKey="error" stroke="var(--destructive)" strokeWidth={2} fill="url(#gradError)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ---------------------------- CHART: DONUT -------------------------------- */

function AgentDonutCard({ agents, loading }: { agents: any[]; loading: boolean }) {
  const now = Date.now();
  const online = agents.filter((a) => a.last_heartbeat_at && now - new Date(a.last_heartbeat_at).getTime() < ONE_MIN).length;
  const stale = agents.filter((a) => {
    if (!a.last_heartbeat_at) return false;
    const age = now - new Date(a.last_heartbeat_at).getTime();
    return age >= ONE_MIN && age <= FIVE_MIN;
  }).length;
  const offline = agents.length - online - stale;

  const chartData = [
    { name: "Online", value: online, color: "var(--success)" },
    { name: "Instável", value: stale, color: "var(--warning)" },
    { name: "Offline", value: offline, color: "var(--destructive)" },
  ];
  const total = agents.length;

  return (
    <Card className="p-5 bg-card/60 border-border backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-mono text-sm font-semibold flex items-center gap-2">
          <HeartPulse className="h-3.5 w-3.5 text-primary" />
          Distribuição de agentes
        </h2>
      </div>
      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : total === 0 ? (
        <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">
          Nenhum agente registrado
        </div>
      ) : (
        <div className="relative">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData} dataKey="value" nameKey="name"
                  innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none"
                >
                  {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)", border: "1px solid var(--border)",
                    borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-2xl font-semibold">{total}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">agentes</div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {chartData.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-xs font-mono">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="text-foreground font-semibold">{c.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* --------------------------- CHART: FAILURES ------------------------------ */

function FailuresBarCard({ errors, loading }: { errors: any[]; loading: boolean }) {
  const top = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of errors) {
      const k = e.databases?.name ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [errors]);

  return (
    <Card className="lg:col-span-2 p-5 bg-card/60 border-border backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-mono text-sm font-semibold flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            Bancos com mais falhas
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Últimas 24 horas · top 6</p>
        </div>
        <Badge variant={errors.length === 0 ? "success" : errors.length > 10 ? "destructive" : "warning"}>
          {errors.length} erros
        </Badge>
      </div>
      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : top.length === 0 ? (
        <div className="h-56 flex items-center justify-center gap-2 text-success text-sm">
          <CheckCircle2 className="h-5 w-5" />
          Nenhuma falha nas últimas 24 horas
        </div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="gradFail" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="var(--warning)" stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={120} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                contentStyle={{
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)",
                }}
              />
              <Bar dataKey="count" fill="url(#gradFail)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* --------------------------- Alerts Panel --------------------------------- */

function AlertsPanel({
  loading, agents, databases, errors,
}: { loading: boolean; agents: any[]; databases: any[]; errors: any[] }) {
  const offlineAgents = agents.filter(
    (a) => a.status !== "online" ||
      !a.last_heartbeat_at ||
      Date.now() - new Date(a.last_heartbeat_at).getTime() > FIVE_MIN
  );
  const missingToken = databases.filter((d) => !d.agent_token);
  const totalAlerts = offlineAgents.length + errors.length + missingToken.length;
  const ok = !loading && totalAlerts === 0;

  return (
    <Card className="p-5 bg-card/60 border-border backdrop-blur-sm">
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
            {errors.length > 0 && (
              <AlertBadge tone="destructive" icon={<XCircle className="h-3 w-3" />}
                label={`${errors.length} sync(s) com erro (24h)`} />
            )}
            {missingToken.length > 0 && (
              <AlertBadge tone="warning" icon={<KeyRound className="h-3 w-3" />}
                label={`${missingToken.length} banco(s) sem token de agente`} />
            )}
          </div>
          {(offlineAgents.length > 0 || errors.length > 0) && (
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
              {errors.slice(0, 3).map((e: any) => (
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

/* --------------------------- Activity heatmap ----------------------------- */

function ActivityHeatmap({ data, loading }: { data: any[]; loading: boolean }) {
  const counts = new Map<string, number>();
  for (const r of data) {
    const d = new Date(r.started_at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: Date; count: number; key: string }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: d, count: counts.get(k) ?? 0, key: k });
  }

  const firstDow = days[0].date.getDay();
  const padded: ({ date: Date; count: number; key: string } | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ];
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
    "bg-primary border-primary shadow-[0_0_8px_var(--primary)]",
  ];
  const monthLabels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const dayLabels = ["", "Seg", "", "Qua", "", "Sex", ""];

  return (
    <Card className="p-5 bg-card/60 border-border backdrop-blur-sm">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            Atividade de sincronização
          </h2>
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
            <div className="flex flex-col gap-[3px] pt-4">
              {dayLabels.map((l, i) => (
                <div key={i} className="h-[14px] text-[9px] font-mono text-muted-foreground leading-none flex items-center">
                  {l}
                </div>
              ))}
            </div>

            <div>
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
                          className={`w-[14px] h-[14px] rounded-[3px] border ${levelClass[lvl]} hover:ring-1 hover:ring-primary transition-all cursor-default`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

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

/* --------------------------- Sync status badge ---------------------------- */

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
      {cfg.pulse && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse mr-1" />}
      {cfg.label}
    </Badge>
  );
}

/* --------------------------- Agent health --------------------------------- */

function AgentHealthSection({ agents, loading }: { agents: any[]; loading: boolean }) {
  const now = Date.now();
  const TWO_MIN = 2 * ONE_MIN;

  const total = agents.length;
  const online = agents.filter(
    (a) => a.last_heartbeat_at && now - new Date(a.last_heartbeat_at).getTime() < ONE_MIN
  ).length;
  const offline = agents.filter(
    (a) => !a.last_heartbeat_at || now - new Date(a.last_heartbeat_at).getTime() > FIVE_MIN
  ).length;
  const stuck = agents.filter((a) => {
    const pending = Array.isArray(a.pending_commands) ? a.pending_commands : [];
    if (pending.length === 0) return false;
    const oldest = pending.reduce((min: number, c: any) => {
      const t = c.enqueued_at ? new Date(c.enqueued_at).getTime() : now;
      return Math.min(min, t);
    }, now);
    return now - oldest > TWO_MIN;
  }).length;

  const queueMax = agents.reduce((max: number, a: any) => {
    const q = Number(a?.system_info?.queue_depth ?? 0);
    return Number.isFinite(q) && q > max ? q : max;
  }, 0);
  const queueTone: "muted" | "warning" | "destructive" =
    queueMax >= 40000 ? "destructive" : queueMax >= 5000 ? "warning" : "muted";

  const alertAgents = agents.filter((a) => {
    const ageMs = a.last_heartbeat_at ? now - new Date(a.last_heartbeat_at).getTime() : Infinity;
    if (ageMs > ONE_MIN) return true;
    const pending = Array.isArray(a.pending_commands) ? a.pending_commands : [];
    if (pending.length > 0) {
      const oldest = pending.reduce(
        (min: number, c: any) => Math.min(min, c.enqueued_at ? new Date(c.enqueued_at).getTime() : now),
        now,
      );
      if (now - oldest > TWO_MIN) return true;
    }
    return false;
  });

  function tone(a: any): { color: string; label: string } {
    const ageMs = a.last_heartbeat_at ? now - new Date(a.last_heartbeat_at).getTime() : Infinity;
    if (ageMs > FIVE_MIN) return { color: "destructive", label: "Offline" };
    const pending = Array.isArray(a.pending_commands) ? a.pending_commands : [];
    if (pending.length > 0) {
      const oldest = pending.reduce(
        (min: number, c: any) => Math.min(min, c.enqueued_at ? new Date(c.enqueued_at).getTime() : now),
        now,
      );
      if (now - oldest > TWO_MIN) return { color: "warning", label: "Comandos travados" };
    }
    if (ageMs > ONE_MIN) return { color: "warning", label: "Sem heartbeat recente" };
    return { color: "success", label: "OK" };
  }

  return (
    <Card className="p-5 bg-card/60 border-border backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm font-semibold">Saúde dos agentes</h2>
        </div>
        <Badge variant="muted">{loading ? "…" : `${total} registrados`}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <HealthStat icon={<Wifi className="h-4 w-4" />} label="Online" value={online} loading={loading} tone="success" />
        <HealthStat icon={<Clock className="h-4 w-4" />} label="Travados >2min" value={stuck} loading={loading} tone="warning" />
        <HealthStat icon={<WifiOff className="h-4 w-4" />} label="Offline >5min" value={offline} loading={loading} tone="destructive" />
        <HealthStat icon={<HeartPulse className="h-4 w-4" />} label="Fila offline" value={queueMax} loading={loading} tone={queueTone} />
      </div>

      {!loading && alertAgents.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono mb-2">
            Em alerta
          </div>
          <div className="space-y-1.5">
            {alertAgents.slice(0, 4).map((a) => {
              const t = tone(a);
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border/50 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono truncate">{a.alias ?? a.agent_uid}</div>
                    <div className="text-[10px] text-muted-foreground">{formatRelative(a.last_heartbeat_at)}</div>
                  </div>
                  <Badge variant={t.color as any}>{t.label}</Badge>
                </div>
              );
            })}
          </div>
          <Button asChild size="sm" variant="ghost" className="w-full mt-2 h-7 text-xs">
            <Link to="/sincronizacao">Ver todos</Link>
          </Button>
        </div>
      )}

      {!loading && alertAgents.length === 0 && total > 0 && (
        <div className="flex items-center gap-2 text-success text-sm pt-2 border-t border-border">
          <ShieldCheck className="h-4 w-4" />
          Todos os agentes operando normalmente.
        </div>
      )}
    </Card>
  );
}

function HealthStat({
  icon, label, value, loading, tone,
}: {
  icon: React.ReactNode; label: string; value: number; loading: boolean;
  tone: "muted" | "success" | "warning" | "destructive";
}) {
  const toneMap = {
    muted: "text-muted-foreground bg-muted/30 border-border",
    success: "text-success bg-success/10 border-success/30",
    warning: "text-warning bg-warning/10 border-warning/30",
    destructive: "text-destructive bg-destructive/10 border-destructive/30",
  };
  const shown = useCountUp(value);
  return (
    <div className={`rounded-md border p-3 ${toneMap[tone]} transition-transform hover:-translate-y-0.5`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-mono">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-10" />
      ) : (
        <div className="font-mono text-2xl font-semibold leading-none tabular-nums">{shown}</div>
      )}
    </div>
  );
}
