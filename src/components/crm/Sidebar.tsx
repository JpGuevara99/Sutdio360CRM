"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTheme } from "@/components/theme/ThemeProvider";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▣" },
  { href: "/proyectos", label: "Proyectos", icon: "▤" },
  { href: "/clientes", label: "Clientes", icon: "☺" },
  { href: "/materiales", label: "Lista de Materiales", icon: "▦" },
  { href: "/cotizador", label: "Cotizador", icon: "☰" },
  { href: "/leads/nuevo", label: "Nueva visita", icon: "+" },
];

const STORAGE_KEY = "studio360.sidebarCollapsed";

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div
      className={`relative z-30 flex h-full shrink-0 transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-60"
      } ${ready ? "" : "w-60"}`}
    >
      <aside className="flex h-full w-full flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-sidebar">
        <div
          className={`flex items-center py-4 ${collapsed ? "justify-center px-2" : "px-4"}`}
        >
          <Link
            href="/"
            title="Studio360"
            className="inline-flex items-center justify-center"
          >
            <BrandLogo
              size={collapsed ? "sm" : "md"}
              className={collapsed ? "h-7" : "h-9"}
              priority
              adaptToTheme
            />
          </Link>
        </div>

      <nav
        className={`flex flex-1 flex-col gap-1 pb-4 ${collapsed ? "px-2" : "px-3"}`}
      >
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center rounded-full text-sm transition ${
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-2.5"
              } ${
                active
                  ? "bg-primary-soft font-medium text-primary-text"
                  : "text-muted-strong hover:bg-hover"
              }`}
            >
              <span className="w-4 text-center text-xs opacity-70">
                {item.icon}
              </span>
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>

      <div
        className={`border-t border-border p-3 ${collapsed ? "px-2" : ""}`}
      >
        <button
          type="button"
          onClick={toggleTheme}
          className={`flex w-full items-center rounded-full px-3 py-2 text-sm text-muted-strong transition hover:bg-hover ${
            collapsed ? "justify-center px-0" : "gap-2.5"
          }`}
          aria-label={
            theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
          }
          title={
            theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
          }
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          {!collapsed ? (
            <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          ) : null}
        </button>
      </div>
      </aside>
      <button
        type="button"
        onClick={toggleCollapsed}
        className="absolute top-8 right-0 z-40 flex h-7 w-7 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-[#1a73e8] text-white shadow-md ring-2 ring-background transition hover:bg-[#1765cc]"
        aria-label={collapsed ? "Mostrar menú" : "Ocultar menú"}
        title={collapsed ? "Mostrar menú" : "Ocultar menú"}
      >
        <ChevronIcon direction={collapsed ? "right" : "left"} />
      </button>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={direction === "right" ? "rotate-180" : undefined}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="text-muted-strong"
    >
      <path d="M12.1 2.1a1 1 0 0 1 .9 1.5A8 8 0 1 0 20.4 14a1 1 0 0 1 1.5.9A10 10 0 1 1 11.2 2a1 1 0 0 1 .9.1z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
      className="text-muted-strong"
    >
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
