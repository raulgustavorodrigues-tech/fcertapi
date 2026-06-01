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
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [companies, databases, syncs24h, agentsOnline, lastSyncs, agents] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("databases").select("id", { count: "exact", head: true }),
        supabase.from("sync_logs").select("id", { count: "exact", head: true }).gte("started_at", since),
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("status", "online"),
        supabase
          .from("sync_logs")
          .select("id, started_at, finished_at, duration_ms, records_count, status, database_id, databases(name, companies(name))")
          .order("started_at", { ascending: false })
          .limit(10),
        supabase.from("agents").select("*").order("last_heartbeat_at", { ascending: false }).limit(8),
      ]);
      return {
        companies: companies.count ?? 0,
        databases: databases.count ?? 0,
        syncs24h: syncs24h.count ?? 0,
        agentsOnline: agentsOnline.count ?? 0,
        lastSyncs: lastSyncs.data ?? [],
        agents: agents.data ?? [],
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Building2 className="h-5 w-5" />}
          label="Empresas cadastradas"
          value={data?.companies}
          loading={isLoading}
          delta="+0%"
          accent="primary"
        />
        <KpiCard
          icon={<DatabaseIcon className="h-5 w-5" />}
          label="Bancos conectados"
          value={data?.databases}
          loading={isLoading}
          delta="+0%"
          accent="info"
        />
        <KpiCard
          icon={<RefreshCw className="h-5 w-5" />}
          label="Sincronizações 24h"
          value={data?.syncs24h}
          loading={isLoading}
          delta="+0%"
          accent="success"
        />
        <KpiCard
          icon={<Activity className="h-5 w-5" />}
          label="Agentes online"
          value={data?.agentsOnline}
          loading={isLoading}
          delta="0"
          accent="warning"
        />
      </div>

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
