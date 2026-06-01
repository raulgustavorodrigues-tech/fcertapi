import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Database,
  Table as TableIcon,
  Code2,
  Wifi,
  RefreshCw,
  Settings,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const items: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/empresas", label: "Empresas", icon: Building2 },
  { to: "/bancos", label: "Bancos de Dados", icon: Database },
  { to: "/tabelas", label: "Tabelas", icon: TableIcon },
  { to: "/queries", label: "Queries", icon: Code2 },
  { to: "/conectividade", label: "Conectividade", icon: Wifi },
  { to: "/sincronizacao", label: "Sincronização", icon: RefreshCw },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-[240px] bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Server className="h-5 w-5 text-primary" />
        </div>
        <div className="leading-tight">
          <div className="font-mono font-semibold text-foreground text-sm tracking-tight">
            CONECTA<span className="text-primary"> API</span>
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
            Firebird Hub
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 cursor-pointer",
                active
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="status-dot pulse" style={{ background: "var(--success)" }} />
          <span className="text-muted-foreground font-mono">Sistema operacional</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">v1.0.0</span>
      </div>
    </aside>
  );
}
