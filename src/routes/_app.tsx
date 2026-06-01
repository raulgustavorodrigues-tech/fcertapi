import { createFileRoute, redirect, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppSidebar } from "@/components/conecta/AppSidebar";
import { AppHeader } from "@/components/conecta/AppHeader";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground font-mono text-sm">Carregando…</div>
      </div>
    );
  }

  if (!user) {
    // client-side gate
    throw redirect({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 ml-[240px]">
        <AppHeader pathname={pathname} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
