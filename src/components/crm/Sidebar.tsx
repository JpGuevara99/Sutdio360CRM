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
  { href: "/leads/nuevo", label: "Nuevo Lead / Proyecto", icon: "+" },
  { href: "/papelera", label: "Papelera de Reciclaje", icon: "🗑" },
];

const STORAGE_KEY = "studio360.sidebarCollapsed";

export function Sidebar({ driveUrl }: { driveUrl: string }) {
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

      <div className={`pb-2 ${collapsed ? "px-2" : "px-3"}`}>
        <div
          className={`flex ${
            collapsed ? "flex-col items-center gap-0.5" : "gap-0.5"
          }`}
        >
          <ShortcutLink href={driveUrl} label="Google Drive">
            <DriveIcon />
          </ShortcutLink>
          <ShortcutLink href="https://tasks.google.com/" label="Google Tasks">
            <TasksIcon />
          </ShortcutLink>
          <ShortcutLink
            href="https://calendar.google.com/"
            label="Google Calendar"
          >
            <CalendarIcon />
          </ShortcutLink>
        </div>
      </div>

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

function ShortcutLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent transition hover:border-border hover:bg-hover"
    >
      {children}
    </a>
  );
}

function DriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 87.3 78" aria-hidden>
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25.35-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z"
        fill="#00a6f0"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.4-12.8c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.85 11.5z"
        fill="#00832d"
      />
      <path
        d="m43.65 25.35 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53.25h27.5c0-1.55-.4-3.1-1.2-4.5l-7.4-12.8-1.6-2.75c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8z"
        fill="#ea4335"
      />
      <path
        d="m59.8 53.25-5.85-11.5-10.3-20.4-10.3 20.4-5.85 11.5z"
        fill="#2684fc"
      />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4.5 12.6 8.4 16.5l11.1-11.1a1.6 1.6 0 0 0-2.3-2.3L8.4 12l-1.6-1.7a1.6 1.6 0 0 0-2.3 2.3z"
        fill="#1a73e8"
      />
      <path
        d="M8.4 16.5 4.5 20.4a1.6 1.6 0 0 1-2.3-2.3l2.3-2.3z"
        fill="#4285f4"
      />
      <circle cx="19" cy="19" r="3" fill="#fbbc04" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2.5" fill="#ffffff" />
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5V8H3z"
        fill="#1a73e8"
      />
      <rect
        x="3.75"
        y="4.75"
        width="16.5"
        height="15.5"
        rx="2"
        fill="none"
        stroke="#4285f4"
        strokeWidth="1.5"
      />
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="#1a73e8"
        fontFamily="Arial, sans-serif"
      >
        31
      </text>
    </svg>
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
