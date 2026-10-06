const posthogRegion = process.env.NEXT_PUBLIC_POSTHOG_REGION === "eu" ? "eu" : "us";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PostHog pasa por nuestro dominio: los bloqueadores de anuncios cortan posthog.com.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `https://${posthogRegion}-assets.i.posthog.com/static/:path*` },
      { source: "/ingest/array/:path*", destination: `https://${posthogRegion}-assets.i.posthog.com/array/:path*` },
      { source: "/ingest/:path*", destination: `https://${posthogRegion}.i.posthog.com/:path*` },
    ];
  },
  // PostHog usa rutas con barra al final; sin esto Next las redirige y se pierden.
  skipTrailingSlashRedirect: true,
};
export default nextConfig;
