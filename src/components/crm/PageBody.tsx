/**
 * Contenedor de página del CRM.
 * El layout ya fija la ventana (sin scroll de documento); este `<main>`
 * llena el resto bajo el TopBar. Páginas nuevas: usar siempre PageBody.
 */
export function PageBody({
  children,
  className = "",
  /** Sin scroll en main: el hijo debe ocupar el alto y scrollear por dentro */
  fill = false,
}: {
  children: React.ReactNode;
  className?: string;
  fill?: boolean;
}) {
  return (
    <main
      className={`${
        fill ? "crm-board flex min-h-0 flex-col gap-4" : ""
      } p-6 ${className}`.trim()}
    >
      {children}
    </main>
  );
}

/** Panel que crece y scrollea dentro de una página `fill` */
export function FillPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface ${className}`.trim()}
    >
      {children}
    </section>
  );
}
