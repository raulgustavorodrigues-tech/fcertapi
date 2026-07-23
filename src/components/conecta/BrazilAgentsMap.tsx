import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { MapPin, Radio } from "lucide-react";

/**
 * Mapa do Brasil com marcadores de agentes ativos por UF.
 * Cada agente pode informar sua UF em system_info.uf (ou state / location.uf).
 * Sem UF: entra em "sem localização" e não aparece no mapa.
 */

type StateDot = { uf: string; name: string; x: number; y: number };

const STATES: StateDot[] = [
  { uf: "AC", name: "Acre", x: 95, y: 250 },
  { uf: "AM", name: "Amazonas", x: 165, y: 200 },
  { uf: "RR", name: "Roraima", x: 180, y: 125 },
  { uf: "AP", name: "Amapá", x: 275, y: 130 },
  { uf: "PA", name: "Pará", x: 260, y: 195 },
  { uf: "RO", name: "Rondônia", x: 150, y: 265 },
  { uf: "TO", name: "Tocantins", x: 305, y: 245 },
  { uf: "MA", name: "Maranhão", x: 340, y: 205 },
  { uf: "PI", name: "Piauí", x: 370, y: 230 },
  { uf: "CE", name: "Ceará", x: 405, y: 190 },
  { uf: "RN", name: "R.G.Norte", x: 445, y: 200 },
  { uf: "PB", name: "Paraíba", x: 455, y: 218 },
  { uf: "PE", name: "Pernambuco", x: 435, y: 238 },
  { uf: "AL", name: "Alagoas", x: 450, y: 258 },
  { uf: "SE", name: "Sergipe", x: 430, y: 275 },
  { uf: "BA", name: "Bahia", x: 385, y: 290 },
  { uf: "MT", name: "Mato Grosso", x: 230, y: 280 },
  { uf: "MS", name: "M.G.do Sul", x: 245, y: 360 },
  { uf: "GO", name: "Goiás", x: 300, y: 320 },
  { uf: "DF", name: "Distrito Federal", x: 325, y: 308 },
  { uf: "MG", name: "Minas Gerais", x: 355, y: 340 },
  { uf: "ES", name: "E.Santo", x: 405, y: 355 },
  { uf: "RJ", name: "R.Janeiro", x: 390, y: 380 },
  { uf: "SP", name: "São Paulo", x: 330, y: 385 },
  { uf: "PR", name: "Paraná", x: 295, y: 415 },
  { uf: "SC", name: "S.Catarina", x: 300, y: 440 },
  { uf: "RS", name: "R.G.do Sul", x: 265, y: 470 },
];

// Contorno aproximado do Brasil (viewBox 500x520).
// Suficiente para o mapa ser reconhecível sem virar um trabalho de cartografia.
const BRAZIL_OUTLINE =
  "M 155,100 L 200,80 L 250,92 L 300,102 L 340,125 L 380,150 L 420,170 L 455,190 L 475,215 L 478,238 L 470,258 L 458,278 L 450,305 L 435,340 L 418,370 L 398,395 L 372,415 L 340,435 L 310,455 L 275,475 L 245,470 L 220,450 L 200,420 L 180,390 L 160,355 L 145,320 L 130,285 L 115,255 L 95,225 L 82,195 L 85,160 L 105,130 L 130,110 L 155,100 Z";

type Agent = {
  id: string;
  alias?: string | null;
  agent_uid?: string | null;
  status?: string | null;
  last_heartbeat_at?: string | null;
  system_info?: any;
};

export function BrazilAgentsMap({ agents, loading }: { agents: Agent[]; loading: boolean }) {
  const now = Date.now();

  const byState = useMemo(() => {
    const m = new Map<string, { online: number; offline: number; total: number }>();
    for (const a of agents) {
      const raw =
        a.system_info?.uf ??
        a.system_info?.state ??
        a.system_info?.location?.uf ??
        a.system_info?.location?.state ??
        "";
      const uf = String(raw).toUpperCase().trim().slice(0, 2);
      if (!uf) continue;
      const online =
        !!a.last_heartbeat_at &&
        now - new Date(a.last_heartbeat_at).getTime() < 60_000;
      const cur = m.get(uf) ?? { online: 0, offline: 0, total: 0 };
      cur.total++;
      if (online) cur.online++;
      else cur.offline++;
      m.set(uf, cur);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  const totalOnline = [...byState.values()].reduce((s, v) => s + v.online, 0);
  const totalMapped = [...byState.values()].reduce((s, v) => s + v.total, 0);
  const withoutLocation = agents.length - totalMapped;
  const statesActive = [...byState.entries()].filter(([, v]) => v.online > 0).length;

  return (
    <Card className="lg:col-span-2 relative overflow-hidden p-5 bg-card/60 border-border backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-info/10 blur-3xl"
      />

      <div className="relative flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-mono text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Mapa do Brasil — Agentes ativos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Distribuição geográfica dos agentes FireSync em tempo real
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

      <div className="relative w-full mx-auto" style={{ maxWidth: 560 }}>
        <svg viewBox="0 0 500 520" className="w-full h-auto block">
          <defs>
            <radialGradient id="brFill" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
            </radialGradient>
            <pattern id="brGrid" width="14" height="14" patternUnits="userSpaceOnUse">
              <path d="M 14 0 L 0 0 0 14" fill="none" stroke="var(--border)" strokeWidth="0.4" opacity="0.55" />
            </pattern>
            <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Silhueta do Brasil */}
          <path d={BRAZIL_OUTLINE} fill="url(#brFill)" />
          <path d={BRAZIL_OUTLINE} fill="url(#brGrid)" opacity="0.9" />
          <path
            d={BRAZIL_OUTLINE}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.2"
            strokeOpacity="0.6"
            filter="url(#dotGlow)"
          />

          {/* Marcadores das UFs */}
          {STATES.map((s) => {
            const info = byState.get(s.uf);
            const hasOnline = (info?.online ?? 0) > 0;
            const hasAgent = (info?.total ?? 0) > 0;
            const color = hasOnline
              ? "var(--success)"
              : hasAgent
                ? "var(--warning)"
                : "var(--muted-foreground)";
            const r = hasOnline ? 5.5 : hasAgent ? 4.5 : 2.2;
            const labelOpacity = hasAgent ? 1 : 0.5;

            return (
              <g key={s.uf}>
                {hasOnline && (
                  <>
                    <circle cx={s.x} cy={s.y} r={r + 3} fill={color} opacity="0.25">
                      <animate
                        attributeName="r"
                        values={`${r + 2};${r + 12};${r + 2}`}
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.55;0;0.55"
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={r}
                  fill={color}
                  filter={hasOnline ? "url(#dotGlow)" : undefined}
                />
                <text
                  x={s.x}
                  y={s.y - r - 3}
                  textAnchor="middle"
                  fontSize={hasAgent ? 9 : 8}
                  fontFamily="var(--font-mono)"
                  fill={hasAgent ? "var(--foreground)" : "var(--muted-foreground)"}
                  opacity={labelOpacity}
                >
                  {s.uf}
                </text>
                {hasAgent && (
                  <text
                    x={s.x}
                    y={s.y + r + 9}
                    textAnchor="middle"
                    fontSize="8"
                    fontFamily="var(--font-mono)"
                    fill={color}
                  >
                    {info!.online}/{info!.total}
                  </text>
                )}
                <title>
                  {s.name} ({s.uf}) — {info ? `${info.online}/${info.total} online` : "sem agente"}
                </title>
              </g>
            );
          })}
        </svg>
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
    </Card>
  );
}
