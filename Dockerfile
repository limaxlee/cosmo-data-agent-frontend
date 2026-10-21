FROM docker-remote.bart.sec.samsung.net/node:22-alpine AS deps

WORKDIR /home/work/cosmo-da-frontend

ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci

FROM docker-remote.bart.sec.samsung.net/node:22-alpine AS builder

WORKDIR /home/work/cosmo-da-frontend

ENV HUSKY=0
ENV NEXT_TELEMETRY_DISABLED=1


ARG NEXT_PUBLIC_APP_TITLE="Data Agent"
ARG NEXT_PUBLIC_MAX_INPUT_LENGTH="100000"

ENV NEXT_PUBLIC_APP_TITLE=$NEXT_PUBLIC_APP_TITLE
ENV NEXT_PUBLIC_MAX_INPUT_LENGTH=$NEXT_PUBLIC_MAX_INPUT_LENGTH

COPY --from=deps /home/work/cosmo-da-frontend/node_modules ./node_modules
COPY . .

RUN npm run build

FROM docker-remote.bart.sec.samsung.net/node:22-alpine AS runner

WORKDIR /home/work/cosmo-da-frontend

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ENV HOSTNAME=0.0.0.0
ENV PORT=13080

ENV BACKEND_ORIGIN=http://10.240.35.173:18080


COPY --from=builder /home/work/cosmo-da-frontend/public ./public
COPY --from=builder /home/work/cosmo-da-frontend/.next/standalone ./
COPY --from=builder /home/work/cosmo-da-frontend/.next/static ./.next/static

USER node

EXPOSE 13080

CMD ["node", "server.js"]
