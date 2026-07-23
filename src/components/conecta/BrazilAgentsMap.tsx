import { useMemo, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { MapPin, Radio, Circle, Database as DatabaseIcon, Building2 } from "lucide-react";
import { BR_STATES, BR_MAP_WIDTH, BR_MAP_HEIGHT } from "./br-map-data";
import { formatRelative } from "@/lib/format";

const UF_NAME: Record<string, string> = Object.fromEntries(
  BR_STATES.map((s) => [s.uf, s.name]),
);

type Agent = {
  id: string;
  alias?: string | null;
  agent_uid?: string | null;
  status?: string | null;
  last_heartbeat_at?: string | null;
  system_info?: any;
  database_id?: string | null;
  databases?: { name?: string | null; companies?: { name?: string | null; state?: string | null } | null } | null;
};

type AgentBucket = { online: Agent[]; stale: Agent[]; offline: Agent[]; all: Agent[] };

function ufOf(a: Agent): string {
  const raw =
    a.databases?.companies?.state ??
    a.system_info?.uf ??
    a.system_info?.state ??
    a.system_info?.location?.uf ??
    a.system_info?.location?.state ??
    "";
  return String(raw).toUpperCase().trim().slice(0, 2);
}

function classify(a: Agent, now: number): "online" | "stale" | "offline" {
  if (!a.last_heartbeat_at) return "offline";
  const age = now - new Date(a.last_heartbeat_at).getTime();
  if (age < 60_000) return "online";
  if (age < 5 * 60_000) return "stale";
  return "offline";
}

export function BrazilAgentsMap({ agents, loading }: { agents: Agent[]; loading: boolean }) {
  const now = Date.now();
  const [hover, setHover] = useState<{ uf: string; x: number; y: number } | null>(null);
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const byState = useMemo(() => {
    const m = new Map<string, AgentBucket>();
    for (const a of agents) {
      const uf = ufOf(a);
      if (!uf) continue;
      const bucket = m.get(uf) ?? { online: [], stale: [], offline: [], all: [] };
      bucket.all.push(a);
      bucket[classify(a, now)].push(a);
      m.set(uf, bucket);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  const totalOnline = [...byState.values()].reduce((s, v) => s + v.online.length, 0);
  const totalMapped = [...byState.values()].reduce((s, v) => s + v.all.length, 0);
  const withoutLocation = agents.length - totalMapped;
  const statesActive = [...byState.entries()].filter(([, v]) => v.online.length > 0).length;

  const hoveredBucket = hover ? byState.get(hover.uf) : null;
  const selectedBucket = selectedUf ? byState.get(selectedUf) : null;

  return (
    <Card className="lg:col-span-2 relative overflow-hidden p-5 bg-card/60 border-border backdrop-blur-sm">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-info/10 blur-3xl" />

      <div className="relative flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-mono text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Mapa do Brasil — Agentes ativos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Passe o mouse para detalhes · clique em uma UF para ver os agentes
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-70 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-foreground font-semibold">{totalOnline}</span> online
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Radio className="h-3 w-3 text-primary" />
            <span className="text-foreground font-semibold">{statesActive}</span> UFs ativas
          </span>
        </div>
      </div>

      <div className="relative w-full mx-auto" style={{ maxWidth: 640 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BR_MAP_WIDTH} ${BR_MAP_HEIGHT}`}
          className="w-full h-auto block"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <radialGradient id="brBg" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </radialGradient>
            <filter id="brGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x={0} y={0} width={BR_MAP_WIDTH} height={BR_MAP_HEIGHT} fill="url(#brBg)" />

          {/* Estados */}
          {BR_STATES.map((s) => {
            const info = byState.get(s.uf);
            const online = info?.online.length ?? 0;
            const total = info?.all.length ?? 0;
            const isHover = hover?.uf === s.uf;
            const isSelected = selectedUf === s.uf;

            const fill =
              online > 0
                ? "var(--success)"
                : total > 0
                  ? "var(--warning)"
                  : "var(--muted)";
            const fillOpacity = online > 0 ? 0.55 : total > 0 ? 0.35 : 0.10;

            return (
              <path
                key={s.uf}
                d={s.d}
                fill={fill}
                fillOpacity={isHover || isSelected ? Math.min(1, fillOpacity + 0.35) : fillOpacity}
                stroke={isSelected ? "var(--primary)" : "var(--border)"}
                strokeWidth={isSelected ? 1.6 : isHover ? 1.2 : 0.6}
                strokeOpacity={0.9}
                filter={online > 0 && isHover ? "url(#brGlow)" : undefined}
                className="cursor-pointer transition-[fill-opacity,stroke-width] duration-150"
                onMouseMove={(e) => {
                  const rect = svgRef.current!.getBoundingClientRect();
                  setHover({
                    uf: s.uf,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
                onMouseEnter={(e) => {
                  const rect = svgRef.current!.getBoundingClientRect();
                  setHover({
                    uf: s.uf,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
                onClick={() => setSelectedUf(s.uf)}
              >
                <title>
                  {s.name} ({s.uf}) — {info ? `${online}/${total} online` : "sem agente"}
                </title>
              </path>
            );
          })}

          {/* Pulsos e labels */}
          {BR_STATES.map((s) => {
            const info = byState.get(s.uf);
            const online = info?.online.length ?? 0;
            const total = info?.all.length ?? 0;
            if (!total && (hover?.uf !== s.uf)) return null;
            const color = online > 0 ? "var(--success)" : total > 0 ? "var(--warning)" : "var(--muted-foreground)";
            return (
              <g key={`m-${s.uf}`} pointerEvents="none">
                {online > 0 && (
                  <circle cx={s.lx} cy={s.ly} r={6} fill={color} opacity="0.35">
                    <animate attributeName="r" values="4;14;4" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                {total > 0 && (
                  <circle cx={s.lx} cy={s.ly} r={total > 0 ? 4 : 2} fill={color} />
                )}
                <text
                  x={s.lx}
                  y={s.ly - 7}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  fill={total > 0 ? "var(--foreground)" : "var(--muted-foreground)"}
                  opacity={total > 0 ? 1 : 0.7}
                  style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}
                >
                  {s.uf}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip flutuante */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 min-w-[180px] rounded-md border border-border bg-popover/95 backdrop-blur-md shadow-lg p-3 text-xs"
            style={{
              left: Math.min(hover.x + 14, 520),
              top: Math.max(hover.y - 8, 4),
            }}
          >
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-primary" />
              {UF_NAME[hover.uf] ?? hover.uf} <span className="text-muted-foreground font-mono">({hover.uf})</span>
            </div>
            {hoveredBucket ? (
              <div className="mt-2 space-y-1 font-mono">
                <div className="flex justify-between gap-6">
                  <span className="text-success">● online</span>
                  <span className="text-foreground font-semibold">{hoveredBucket.online.length}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-warning">● stale</span>
                  <span className="text-foreground font-semibold">{hoveredBucket.stale.length}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-muted-foreground">● offline</span>
                  <span className="text-foreground font-semibold">{hoveredBucket.offline.length}</span>
                </div>
                <div className="pt-1 mt-1 border-t border-border/60 flex justify-between gap-6">
                  <span className="text-muted-foreground">total</span>
                  <span className="text-foreground font-semibold">{hoveredBucket.all.length}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">Clique para detalhes</p>
              </div>
            ) : (
              <div className="mt-1 text-muted-foreground">Sem agentes nesta UF</div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_6px_var(--success)]" />
            online
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" />
            registrado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
            sem agente
          </span>
        </div>
        {withoutLocation > 0 && !loading && (
          <span className="text-muted-foreground/80">
            {withoutLocation} agente(s) sem UF informada
          </span>
        )}
      </div>

      {/* Painel lateral com agentes da UF selecionada */}
      <Sheet open={!!selectedUf} onOpenChange={(v) => !v && setSelectedUf(null)}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-5 pb-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {selectedUf ? `${UF_NAME[selectedUf] ?? selectedUf} (${selectedUf})` : ""}
            </SheetTitle>
            <SheetDescription>
              {selectedBucket
                ? `${selectedBucket.all.length} agente(s) · ${selectedBucket.online.length} online · ${selectedBucket.stale.length} stale · ${selectedBucket.offline.length} offline`
                : "Sem agentes registrados nesta UF."}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {(selectedBucket?.all ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum agente registrado.
                </p>
              )}
              {(selectedBucket?.all ?? [])
                .slice()
                .sort((a, b) => {
                  const rank = (x: Agent) => classify(x, now) === "online" ? 0 : classify(x, now) === "stale" ? 1 : 2;
                  return rank(a) - rank(b);
                })
                .map((a) => {
                  const st = classify(a, now);
                  const tone = st === "online" ? "success" : st === "stale" ? "warning" : "muted";
                  const dot = st === "online" ? "bg-success" : st === "stale" ? "bg-warning" : "bg-muted-foreground/60";
                  return (
                    <div key={a.id} className="rounded-md border border-border bg-card/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${dot} ${st === "online" ? "shadow-[0_0_6px_var(--success)]" : ""}`} />
                            {a.alias ?? a.agent_uid ?? a.id.slice(0, 8)}
                          </div>
                          <div className="mt-1 text-[11px] font-mono text-muted-foreground flex items-center gap-1.5 truncate">
                            <DatabaseIcon className="h-3 w-3" />
                            {a.databases?.name ?? "—"}
                          </div>
                          {a.databases?.companies?.name && (
                            <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5 truncate">
                              <Building2 className="h-3 w-3" />
                              {a.databases.companies.name}
                            </div>
                          )}
                        </div>
                        <Badge variant={tone as any} className="shrink-0 uppercase text-[10px]">
                          {st}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Circle className="h-2.5 w-2.5" />
                          {a.agent_uid ?? a.id.slice(0, 12)}
                        </span>
                        <span>
                          {a.last_heartbeat_at
                            ? `heartbeat ${formatRelative(a.last_heartbeat_at)}`
                            : "sem heartbeat"}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
