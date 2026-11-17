import Link from "next/link";
import { LogOut } from "lucide-react";
import { Nav } from "@/components/app/nav";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { requireUser } from "@/server/services/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="no-print border-b p-3 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r md:p-4">
        <div className="mb-2 flex items-center justify-between md:mb-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">R</span>
            {APP_NAME}
          </Link>
          <div className="flex items-center md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <Nav />
        <div className="mt-6 hidden border-t pt-4 md:block">
          <p className="truncate text-xs text-muted-foreground" title={user.email ?? ""}>{user.email}</p>
          <div className="mt-2 flex items-center gap-1">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="h-4 w-4" /> Salir
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}
