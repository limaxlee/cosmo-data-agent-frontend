# Frontend image for the COSMO Data Agent (Next.js, standalone output).
#
#   sudo docker build -t da-frontend:0.0.1 .
#   sudo bash ./run_da_frontend.sh

# ---------------------------------------------------------------- dependencies
FROM docker-remote.bart.sec.samsung.net/node:22-alpine AS deps

WORKDIR /home/work/cosmo-data-agent-frontend

# Skip the husky `prepare` hook: there is no .git directory in the image.
ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------- build
FROM docker-remote.bart.sec.samsung.net/node:22-alpine AS builder

WORKDIR /home/work/cosmo-data-agent-frontend

ENV HUSKY=0
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* values are inlined into the client bundle by Next.js, so they
# have to be present at build time. Override with:
#   docker build --build-arg NEXT_PUBLIC_APP_TITLE="..." .
# The backend URL is deliberately NOT one of these -- see run_da_frontend.sh.
ARG NEXT_PUBLIC_APP_TITLE="Data Agent"
ARG NEXT_PUBLIC_MAX_INPUT_LENGTH="100000"

ENV NEXT_PUBLIC_APP_TITLE=$NEXT_PUBLIC_APP_TITLE
ENV NEXT_PUBLIC_MAX_INPUT_LENGTH=$NEXT_PUBLIC_MAX_INPUT_LENGTH

COPY --from=deps /home/work/cosmo-data-agent-frontend/node_modules ./node_modules
COPY . .

RUN npm run build

# --------------------------------------------------------------------- runtime
FROM docker-remote.bart.sec.samsung.net/node:22-alpine AS runner

WORKDIR /home/work/cosmo-data-agent-frontend

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 0.0.0.0 (not localhost) so the published port is reachable from other devices.
ENV HOSTNAME=0.0.0.0
ENV PORT=13080

# Where the server-side code reaches the ADK backend. Overridable at run time.
ENV BACKEND_ORIGIN=http://10.240.35.173:18080

# `output: "standalone"` emits a self-contained server plus only the node_modules
# it actually uses; static assets and public/ are copied alongside it.
COPY --from=builder /home/work/cosmo-data-agent-frontend/public ./public
COPY --from=builder /home/work/cosmo-data-agent-frontend/.next/standalone ./
COPY --from=builder /home/work/cosmo-data-agent-frontend/.next/static ./.next/static

# Drop privileges; the `node` user ships with the base image.
USER node

EXPOSE 13080

CMD ["node", "server.js"]




except Exception as e:
    logger.exception(...)
    session = await self._session_service.get_session(
        app_name=self._app_name, user_id=user_id, session_id=session_id
    )
    if session:
        await self._session_service.append_event(session, Event(
            author=EventAuthors.SYSTEM,
            error_code="LLM_ERROR",
            error_message=str(e),
        ))
    raise