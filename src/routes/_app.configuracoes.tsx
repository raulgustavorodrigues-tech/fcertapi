import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings, KeyRound, RefreshCw, Copy, History, Eye, EyeOff, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/configuracoes")({ component: Page });

type DBRow = {
  id: string;
  name: string;
  agent_uid: string | null;
  agent_token: string | null;
  company_id: string;
};

type HistoryRow = {
  id: string;
  database_id: string;
  token: string;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `fsh_${hex}`;
}

function Page() {
  const qc = useQueryClient();
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [historyFor, setHistoryFor] = useState<DBRow | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<DBRow | null>(null);
  const [rotateReason, setRotateReason] = useState("");
  const [rotating, setRotating] = useState(false);

  const { data: databases = [], isLoading } = useQuery({
    queryKey: ["cfg-databases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("databases")
        .select("id, name, agent_uid, agent_token, company_id")
        .order("name");
      if (error) throw error;
      return data as DBRow[];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["token-history", historyFor?.id],
    enabled: !!historyFor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_token_history" as any)
        .select("*")
        .eq("database_id", historyFor!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as HistoryRow[];
    },
  });

  async function copy(text: string, label = "Token") {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  async function rotateToken(db: DBRow, reason: string) {
    setRotating(true);
    try {
      const now = new Date().toISOString();
      // Revoga o token atual no histórico (se existir)
      if (db.agent_token) {
        // Garante registro do token anterior no histórico
        await supabase.from("agent_token_history" as any).upsert(
          {
            database_id: db.id,
            token: db.agent_token,
            revoked_at: now,
            revoked_reason: reason || "Rotação manual",
          } as any,
          { onConflict: "database_id,token" } as any,
        );
        // Caso o upsert acima não case (sem unique constraint), faz update direto
        await supabase
          .from("agent_token_history" as any)
          .update({ revoked_at: now, revoked_reason: reason || "Rotação manual" } as any)
          .eq("database_id", db.id)
          .eq("token", db.agent_token)
          .is("revoked_at", null);
      }

      const newToken = generateToken();

      // Insere novo token no histórico
      const { error: insErr } = await supabase
        .from("agent_token_history" as any)
        .insert({ database_id: db.id, token: newToken } as any);
      if (insErr) throw insErr;

      // Atualiza o agente
      const { error: updErr } = await supabase
        .from("databases")
        .update({ agent_token: newToken })
        .eq("id", db.id);
      if (updErr) throw updErr;

      await navigator.clipboard.writeText(newToken);
      toast.success("Novo token gerado e copiado", {
        description: "O token anterior foi revogado. Atualize o agente LocalBridge.",
      });

      qc.invalidateQueries({ queryKey: ["cfg-databases"] });
      qc.invalidateQueries({ queryKey: ["token-history", db.id] });
      setConfirmRotate(null);
      setRotateReason("");
    } catch (e: any) {
      toast.error("Falha ao rotacionar token", { description: e.message });
    } finally {
      setRotating(false);
    }
  }

  function mask(t: string | null) {
    if (!t) return "—";
    if (t.length <= 12) return t;
    return `${t.slice(0, 8)}…${t.slice(-4)}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h2 className="font-mono text-base font-semibold">Configurações</h2>
      </div>

      <Card className="p-5 bg-card border-border">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="font-mono text-sm font-semibold">Tokens dos agentes</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Gerencie os tokens de autenticação utilizados pelo LocalBridge ao sincronizar com o FireSync Hub.
          Ao regenerar, o token anterior é revogado imediatamente e fica registrado no histórico.
        </p>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : databases.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum banco cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {databases.map((db) => (
              <div
                key={db.id}
                className="flex items-center justify-between gap-3 border border-border rounded-md p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold truncate">{db.name}</span>
                    {db.agent_uid && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {db.agent_uid}
                      </Badge>
                    )}
                    {!db.agent_token && (
                      <Badge variant="destructive" className="text-[10px]">
                        sem token
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-[11px] font-mono text-muted-foreground truncate">
                      {show[db.id] ? db.agent_token ?? "—" : mask(db.agent_token)}
                    </code>
                    {db.agent_token && (
                      <button
                        onClick={() => setShow((s) => ({ ...s, [db.id]: !s[db.id] }))}
                        className="text-muted-foreground hover:text-foreground"
                        title={show[db.id] ? "Ocultar" : "Mostrar"}
                      >
                        {show[db.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {db.agent_token && (
                    <Button size="sm" variant="outline" onClick={() => copy(db.agent_token!)}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setHistoryFor(db)}>
                    <History className="h-3 w-3 mr-1" /> Histórico
                  </Button>
                  <Button size="sm" onClick={() => setConfirmRotate(db)}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Regenerar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Dialog: confirmar rotação */}
      <Dialog open={!!confirmRotate} onOpenChange={(o) => !o && setConfirmRotate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Regenerar token do agente
            </DialogTitle>
            <DialogDescription>
              O token atual de <b>{confirmRotate?.name}</b> será revogado imediatamente. O agente
              LocalBridge precisará ser atualizado com o novo token para continuar sincronizando.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-mono">Motivo (opcional)</label>
            <Textarea
              value={rotateReason}
              onChange={(e) => setRotateReason(e.target.value)}
              placeholder="Ex.: token comprometido, rotação periódica…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRotate(null)} disabled={rotating}>
              Cancelar
            </Button>
            <Button
              onClick={() => confirmRotate && rotateToken(confirmRotate, rotateReason)}
              disabled={rotating}
            >
              {rotating ? "Gerando…" : "Regenerar e copiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: histórico */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de tokens — {historyFor?.name}</DialogTitle>
            <DialogDescription>
              Tokens emitidos para este agente. Apenas o token ativo (sem data de revogação) é aceito
              pelo endpoint de sincronização.
            </DialogDescription>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum registro de token.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map((h) => {
                const active = !h.revoked_at;
                return (
                  <div key={h.id} className="border border-border rounded-md p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono truncate">{h.token}</code>
                      <div className="flex items-center gap-2 shrink-0">
                        {active ? (
                          <Badge className="bg-emerald-600">ativo</Badge>
                        ) : (
                          <Badge variant="secondary">revogado</Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => copy(h.token)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1 text-muted-foreground flex flex-wrap gap-x-4">
                      <span>Criado: {new Date(h.created_at).toLocaleString("pt-BR")}</span>
                      {h.revoked_at && (
                        <span>Revogado: {new Date(h.revoked_at).toLocaleString("pt-BR")}</span>
                      )}
                      {h.revoked_reason && <span>Motivo: {h.revoked_reason}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryFor(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
