"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

type BrandLogoProps = {
  /** Visual size preset */
  size?: "sm" | "md" | "lg";
  /** Extra classes applied to the images */
  className?: string;
  priority?: boolean;
  /**
   * UI: letras negras en light, blancas en dark.
   * Cotización/PDF: `false` (siempre letras negras).
   */
  adaptToTheme?: boolean;
};

const SIZES = {
  sm: { width: 120, height: 39, className: "h-7 w-auto" },
  md: { width: 180, height: 58, className: "h-9 w-auto" },
  lg: { width: 260, height: 84, className: "h-12 w-auto" },
} as const;

/**
 * Logo Studio360 (símbolo rojo + wordmark).
 * En modo oscuro de la app las letras pasan a blanco; el rojo se mantiene.
 */
export function BrandLogo({
  size = "md",
  className = "",
  priority = false,
  adaptToTheme = true,
}: BrandLogoProps) {
  const { theme, ready } = useTheme();
  const s = SIZES[size];
  const loading = priority ? "eager" : "lazy";
  const imgClass = `${s.className} object-contain object-left ${className}`.trim();

  const useDark =
    adaptToTheme && ready ? theme === "dark" : false;
  const src = useDark
    ? "/brand/studio360-logo-dark.png"
    : "/brand/studio360-logo.png";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="360studio"
      width={s.width}
      height={s.height}
      decoding="async"
      loading={loading}
      className={imgClass}
    />
  );
}
