# syntax=docker/dockerfile:1
FROM oven/bun:1.3.12-alpine AS builder
WORKDIR /build
COPY package.json bun.lock ./
COPY apps/blog/package.json ./apps/blog/
COPY apps/admin/package.json ./apps/admin/
COPY apps/api/apps/blog/package.json ./apps/api/apps/blog/
COPY apps/api/apps/admin/package.json ./apps/api/apps/admin/
COPY apps/api/packages/core/package.json ./apps/api/packages/core/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY apps/blog ./apps/blog
WORKDIR /build/apps/blog
ARG IMAGE_PUBLIC_URL=http://localhost:8080/images
ENV IMAGE_PUBLIC_URL=$IMAGE_PUBLIC_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/build/apps/blog/.next/cache bun run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /build/apps/blog/public ./apps/blog/public
COPY --from=builder /build/apps/blog/.next/standalone ./
COPY --from=builder /build/apps/blog/.next/static ./apps/blog/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/blog/server.js"]
