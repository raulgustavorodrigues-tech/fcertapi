import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Wifi } from "lucide-react";

export const Route = createFileRoute("/_app/conectividade")({ component: Page });

function Page() {
  return (
    <Card className="p-12 text-center bg-card border-border">
      <Wifi className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-mono text-sm font-semibold">Central de Conectividade</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Testes de PING, autenticação Bearer e SELECT 1 nos agentes locais. Histórico de testes e diagnóstico em lote. Módulo em construção.
      </p>
    </Card>
  );
}
