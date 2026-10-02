# Fútbol de los Jueves

App web para el grupo de fútbol. Incluye encuesta de horario estilo WhatsApp, equipos parejos, resultados, tabla de puntos y rachas. Cada amigo entra con su propia cuenta.

**Stack:** Next.js 15 (App Router) + TypeScript · Supabase (Postgres + Auth + Realtime) · Vercel.

## Cómo funciona

| Quién | Qué puede hacer |
|---|---|
| **Organizador** (los mails de `admin_emails`) | Cargar el plantel, abrir la encuesta, elegir día, formato y horarios, confirmar la hora, armar equipos, cargar resultados, corregir o borrar partidos, votar por alguien que contestó por WhatsApp y desvincular una cuenta mal elegida. |
| **Jugador** | La primera vez elige cuál de los jugadores es (*reclama* su nombre). Después vota "Toy / No toy" y sus horarios, y ve la tabla, las rachas y el historial. |

La seguridad está en la base de datos (Row Level Security), no en el frontend. Un jugador solo puede escribir su propio voto y solo mientras el partido está abierto. Todo lo demás lo escribe el organizador. Las pruebas de RLS se corrieron contra el esquema (20 casos, todos OK). Para correrlas: `npm run test:rls`.

**Puntos:** +1 por jugar, +3 por victoria, +1 por empate, +1 por gol y +2 por figura (en `lib/stats.ts`).
