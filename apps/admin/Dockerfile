FROM oven/bun:1.3.12-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /build
COPY package.json bun.lock ./
COPY apps/blog/package.json ./apps/blog/
COPY apps/admin/package.json ./apps/admin/
COPY apps/api/apps/blog/package.json ./apps/api/apps/blog/
COPY apps/api/apps/admin/package.json ./apps/api/apps/admin/
COPY apps/api/packages/core/package.json ./apps/api/packages/core/
RUN bun install --frozen-lockfile
COPY apps/admin ./apps/admin
WORKDIR /build/apps/admin
ARG IMAGE_PUBLIC_URL=http://localhost:8080/images
ENV IMAGE_PUBLIC_URL=$IMAGE_PUBLIC_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /build/apps/admin/public ./apps/admin/public
COPY --from=builder /build/apps/admin/.next/standalone ./
COPY --from=builder /build/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/admin/server.js"]
