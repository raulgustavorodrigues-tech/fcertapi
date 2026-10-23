import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Copy, KeyRound, Plus, ShieldOff, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import {
  listCompanyApiKeys, createCompanyApiKey, revokeCompanyApiKey,
  listCompanyApis, setCompanyApi, getMyIsAdmin,
} from "@/lib/api-keys.functions";

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success("Copiado");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function CompanyApiDialog({
  companyId, companyName, open, onOpenChange,
}: {
  companyId: string;
  companyName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listCompanyApiKeys);
  const create = useServerFn(createCompanyApiKey);
  const revoke = useServerFn(revokeCompanyApiKey);

  const [newName, setNewName] = useState("Logitech");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [selScopes, setSelScopes] = useState<string[] | null>(null);
  const listApis = useServerFn(listCompanyApis);
  const toggleApi = useServerFn(setCompanyApi);
  const whoami = useServerFn(getMyIsAdmin);
  const { data: me } = useQuery({ queryKey: ["me-admin"], queryFn: () => whoami(), enabled: open });
  const { data: apis = [] } = useQuery({
    queryKey: ["company-apis", companyId],
    queryFn: () => listApis({ data: { companyId } }),
    enabled: open,
  });
  const enabledApis = apis.filter((a: any) => a.enabled && a.status !== "disabled");
  const scopes = selScopes ?? enabledApis.map((a: any) => a.scope);
  const toggleMut = useMutation({
    mutationFn: (v: { apiId: string; enabled: boolean }) => toggleApi({ data: { companyId, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-apis", companyId] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao alterar"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 29 * 86400000);
  const apiUrl = `${origin}/api/v1/entregas?data_inicio=${iso(inicio)}&data_fim=${iso(hoje)}`;
  const apiUrlBase = `${origin}/api/v1/entregas`;

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["company-api-keys", companyId],
    queryFn: () => list({ data: { companyId } }),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: { companyId, name: newName.trim(), scopes } }),
    onSuccess: (res: any) => {
      setPlaintext(res.plaintext);
      qc.invalidateQueries({ queryKey: ["company-api-keys", companyId] });
      toast.success("Chave gerada — copie agora");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar chave"),
  });

  const revokeMut = useMutation({
    mutationFn: (keyId: string) => revoke({ data: { companyId, keyId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-api-keys", companyId] });
      toast.success("Chave revogada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao revogar"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPlaintext(null); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            APIs — {companyName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">APIs disponíveis</Label>
            {apis.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma API no catálogo.</p>}
            {apis.map((a: any) => (
              <div key={a.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{a.name}</div>
                    {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                  </div>
                  {a.status !== "active" && (
                    <Badge variant="muted">{a.status === "testing" ? "EM TESTE" : "DESATIVADA"}</Badge>
                  )}
                  <Switch
                    checked={a.enabled}
                    disabled={!me?.isAdmin || toggleMut.isPending}
                    onCheckedChange={(v) => toggleMut.mutate({ apiId: a.id, enabled: v })}
                  />
                </div>
                {a.enabled && (
                  <>
                    <CopyRow label="Endereço" value={`${origin}${a.path}`} />
                    {a.slug === "entregas" && (
                      <CopyRow label="Exemplo com datas reais (últimos 30 dias)" value={apiUrl} />
                    )}
                    {Array.isArray(a.params_doc) && a.params_doc.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {a.params_doc.map((p: any) => (
                          <div key={p.name}><code className="font-mono">{p.name}</code> — {p.desc}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {!me?.isAdmin && (
              <p className="text-xs text-muted-foreground">Somente administradores podem habilitar APIs.</p>
            )}
          </div>

          <CopyRow label="Cabeçalho de autenticação" value="Authorization: Bearer SUA_CHAVE" />

          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            O erro <span className="font-mono">HTTP 422</span> acontece quando a data é enviada em
            branco ou como texto de exemplo (AAAA-MM-DD). Envie sempre datas reais, ex.:
            <span className="font-mono"> 2026-09-08</span>.
          </div>

          {plaintext && (
            <Card className="p-4 border-primary/50 bg-primary/5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <TriangleAlert className="h-4 w-4" /> Copie a chave agora — ela não será exibida novamente
              </div>
              <CopyRow label="Chave da API" value={plaintext} />
            </Card>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Gerar nova chave</Label>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da chave (ex.: Logitech)"
              />
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || newName.trim().length < 2 || scopes.length === 0}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                {createMut.isPending ? "Gerando…" : "Gerar"}
              </Button>
            </div>
            {enabledApis.length > 0 && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-muted-foreground">A chave dá acesso a:</span>
                {enabledApis.map((a: any) => (
                  <label key={a.id} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={scopes.includes(a.scope)}
                      onCheckedChange={(v) =>
                        setSelScopes(v ? [...scopes, a.scope] : scopes.filter((x: string) => x !== a.scope))
                      }
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            )}
            {enabledApis.length === 0 && (
              <p className="text-xs text-muted-foreground">Habilite ao menos uma API para gerar chaves.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Chaves da empresa</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma chave emitida ainda.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((k: any) => (
                  <div
                    key={k.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{k.name}</div>
                      <div className="font-mono text-xs text-muted-foreground truncate">
                        {k.key_prefix}…
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Criada {formatDateTime(k.created_at)}
                        {k.last_used_at ? ` · último uso ${formatDateTime(k.last_used_at)}` : " · nunca usada"}
                      </div>
                    </div>
                    <Badge variant={k.revoked_at ? "muted" : "success"}>
                      {k.revoked_at ? "REVOGADA" : "ATIVA"}
                    </Badge>
                    {!k.revoked_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revokeMut.mutate(k.id)}
                        disabled={revokeMut.isPending}
                      >
                        <ShieldOff className="h-3.5 w-3.5 mr-1" /> Revogar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
