import type { Metadata, Viewport } from "next";
import "@fontsource/saira-condensed/500.css";
import "@fontsource/saira-condensed/700.css";
import "@fontsource/saira-condensed/800.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "./globals.css";


export const metadata: Metadata = {
  title: "Fútbol de los Jueves",
  description: "Convocatoria, horarios, equipos, resultados y tabla del grupo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1d6a44" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1411" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
