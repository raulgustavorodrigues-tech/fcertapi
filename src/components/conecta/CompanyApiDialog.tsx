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
import { Card } from "@/components/ui/card";
import { Copy, KeyRound, Plus, ShieldOff, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import {
  listCompanyApiKeys, createCompanyApiKey, revokeCompanyApiKey,
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
    mutationFn: () => create({ data: { companyId, name: newName.trim() } }),
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
            Integração API — {companyName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <CopyRow label="Endereço da API (somente o endereço)" value={apiUrlBase} />
          <CopyRow label="Exemplo pronto com datas reais (últimos 30 dias)" value={apiUrl} />
          <CopyRow label="Cabeçalho de autenticação" value="Authorization: Bearer SUA_CHAVE" />

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            O erro <span className="font-mono">HTTP 422</span> acontece quando a data é enviada em
            branco ou como texto de exemplo (AAAA-MM-DD). Envie sempre datas reais no formato
            <span className="font-mono"> 2026-09-08</span>.
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">Parâmetros aceitos</div>
            <div><code className="font-mono">data_inicio</code> — obrigatório, AAAA-MM-DD</div>
            <div><code className="font-mono">data_fim</code> — opcional, AAAA-MM-DD (padrão: data_inicio)</div>
            <div><code className="font-mono">limit</code> — opcional, até 5000 (padrão 1000)</div>
            <div><code className="font-mono">offset</code> — opcional, para paginação</div>
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
                disabled={createMut.isPending || newName.trim().length < 2}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                {createMut.isPending ? "Gerando…" : "Gerar"}
              </Button>
            </div>
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
