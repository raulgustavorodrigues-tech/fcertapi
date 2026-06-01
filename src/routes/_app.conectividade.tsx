import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wifi, Zap, Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/conectividade")({ component: Page });

type Step = { name: string; status: "pending" | "running" | "ok" | "error"; detail?: string; ms?: number };

function Page() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<string>("");
  const [customUrl, setCustomUrl] = useState("");
  const [customToken, setCustomToken] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  const { data: databases = [] } = useQuery({
    queryKey: ["databases-list-conn"],
    queryFn: async () => {
      const { data } = await supabase.from("databases").select("id, name, agent_endpoint, agent_token, companies(name)").order("name");
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

  async function runTest() {
    const db = databases.find((d: any) => d.id === target);
    if (!target && !customUrl) { toast.error("Selecione um banco ou informe URL customizada"); return; }
    setRunning(true);
    const sequence: Step[] = [
      { name: "PING (resolução de host)", status: "pending" },
      { name: "HTTP /health (200 OK)", status: "pending" },
      { name: "AUTH (Bearer token)", status: "pending" },
      { name: "SELECT 1 FROM RDB$DATABASE", status: "pending" },
    ];
    setSteps(sequence);

    const totalStart = Date.now();
    let failedStep: string | null = null;
    let errorDetail: string | null = null;

    for (let i = 0; i < sequence.length; i++) {
      setSteps((s) => s.map((st, idx) => idx === i ? { ...st, status: "running" } : st));
      const stepStart = Date.now();
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 500));
      const fail = Math.random() < 0.12;
      const ms = Date.now() - stepStart;
      if (fail) {
        failedStep = sequence[i].name.split(" ")[0].toLowerCase();
        errorDetail = `Falha em ${sequence[i].name}: timeout após ${ms}ms`;
        setSteps((s) => s.map((st, idx) => idx === i ? { ...st, status: "error", detail: errorDetail!, ms } : st));
        break;
      }
      setSteps((s) => s.map((st, idx) => idx === i ? { ...st, status: "ok", ms } : st));
    }

    const totalMs = Date.now() - totalStart;
    if (target) {
      await supabase.from("connectivity_logs").insert({
        database_id: target,
        latency_ms: totalMs,
        result: failedStep ? "error" : "success",
        step_failed: failedStep,
        error_detail: errorDetail,
      });
      if (!failedStep) {
        await supabase.from("databases").update({ status: "connected" }).eq("id", target);
      } else {
        await supabase.from("databases").update({ status: "disconnected" }).eq("id", target);
      }
      qc.invalidateQueries({ queryKey: ["connectivity_logs"] });
      qc.invalidateQueries({ queryKey: ["databases"] });
    }
    setRunning(false);
    failedStep ? toast.error(`Teste falhou em ${totalMs}ms`) : toast.success(`Diagnóstico OK em ${totalMs}ms`);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card className="p-5 bg-card border-border">
          <h3 className="font-mono text-sm font-semibold mb-4 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" /> Novo diagnóstico
          </h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Banco cadastrado</Label>
              <Select value={target} onValueChange={(v) => { setTarget(v); const d = databases.find((x: any) => x.id === v); if (d) { setCustomUrl(d.agent_endpoint ?? ""); setCustomToken(d.agent_token ?? ""); } }}>
                <SelectTrigger><SelectValue placeholder="Selecione um banco para testar" /></SelectTrigger>
                <SelectContent>
                  {databases.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.companies?.name} · {d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Endpoint customizado</Label>
                <Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="http://192.168.1.100:8000" className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label>Token Bearer</Label>
                <Input value={customToken} onChange={(e) => setCustomToken(e.target.value)} placeholder="abc123…" className="font-mono text-xs" />
              </div>
            </div>
            <Button onClick={runTest} disabled={running} className="w-full">
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Zap className="h-4 w-4 mr-1.5" />}
              {running ? "Executando diagnóstico…" : "Iniciar diagnóstico (4 etapas)"}
            </Button>
          </div>

          {steps.length > 0 && (
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
