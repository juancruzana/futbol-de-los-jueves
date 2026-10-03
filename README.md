# Fútbol de los Jueves

App web para el grupo de fútbol. Incluye encuesta de horario estilo WhatsApp, equipos parejos, resultados, tabla de puntos y rachas. Cada amigo entra con su propia cuenta.

**Stack:** Next.js 15 (App Router) + TypeScript · Supabase (Postgres + Auth + Realtime) · Vercel.

## Cómo funciona

Cada **grupo** es su propio fútbol: plantel, partidos, encuesta, tabla e historial. Una persona puede estar en varios grupos y cambia entre ellos tocando el nombre del grupo arriba a la izquierda. Cualquiera con cuenta puede crear un grupo, y queda como organizador.

| Quién | Qué puede hacer |
|---|---|
| **Organizador** (por grupo) | Abrir la encuesta, elegir día, formato y horarios, confirmar la hora, armar equipos, cargar resultados, corregir o borrar partidos, votar por alguien que contestó por WhatsApp, dar de baja jugadores, nombrar a otros organizadores, cambiarle el nombre al grupo y cambiar el link de invitación. |
| **Jugador** | Entra con el link de invitación del grupo (`/unirse/<código>`), inicia sesión con Google y elige su nombre o apodo para ese grupo (lo puede cambiar después en *Mi perfil*). Después vota "Toy / No toy" y sus horarios, y ve la tabla, las rachas y el historial. También puede compartir el link de invitación. |

La seguridad está en la base de datos (Row Level Security), no en el frontend. Nadie ve ni toca nada de un grupo del que no es parte. Un jugador solo puede escribir su propio voto y solo mientras el partido está abierto. Todo lo demás lo escribe el organizador de ese grupo. Las pruebas de RLS cubren también el aislamiento entre grupos y la migración de una base vieja de un solo grupo (66 casos). Para correrlas: `npm run test:rls`.

**Migración:** si la base es de antes de los grupos, correr `supabase/schema.sql` mete todo lo que había en un grupo "Fútbol de los Jueves". Los mails de `admin_emails` quedan como organizadores y los jugadores con cuenta, como jugadores.

**Puntos:** +1 por jugar, +3 por victoria, +1 por empate, +1 por gol y +2 por figura (en `lib/stats.ts`).
