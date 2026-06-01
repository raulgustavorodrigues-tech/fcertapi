import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Table as TableIcon } from "lucide-react";

export const Route = createFileRoute("/_app/tabelas")({ component: Page });

function Page() {
  return (
    <Card className="p-12 text-center bg-card border-border">
      <TableIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-mono text-sm font-semibold">Explorer de Schema</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Cadastre bancos e configure o agente LocalBridge para visualizar tabelas, colunas e fazer preview dos dados Firebird. Módulo em construção — disponível na próxima iteração.
      </p>
    </Card>
  );
}
