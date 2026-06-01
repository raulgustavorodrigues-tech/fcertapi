import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/sincronizacao")({ component: Page });

function Page() {
  return (
    <Card className="p-12 text-center bg-card border-border">
      <RefreshCw className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-mono text-sm font-semibold">Monitor de Sincronização</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Monitor em tempo real dos agentes, histórico completo, schedules e gestão de clientes registrados. Módulo em construção.
      </p>
    </Card>
  );
}
