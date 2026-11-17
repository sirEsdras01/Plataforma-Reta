"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, Briefcase, FolderKanban, LayoutDashboard, Plus, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/challenges/new", label: "Nuevo reto", icon: Plus },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/resources", label: "Recursos", icon: BookMarked },
  { href: "/portfolio", label: "Portafolio", icon: Briefcase },
  { href: "/profile", label: "Perfil", icon: User },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map((i) => {
        const active = path === i.href || (i.href !== "/dashboard" && path.startsWith(i.href));
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <i.icon className="h-4 w-4" aria-hidden />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
