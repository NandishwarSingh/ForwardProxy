# Multi-stage build: compile TypeScript, ship only runtime artifacts

FROM node:20-alpine AS builder
WORKDIR /app

# Install deps (including dev) to compile TS
COPY package*.json ./
RUN npm ci

# Copy sources needed for build
COPY proxy.ts ./

# Compile TS → JS (outputs proxy.js in the same dir)
RUN npx tsc proxy.ts


FROM node:20-alpine AS runtime
WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# App code
COPY --from=builder /app/proxy.js ./

# Default config inside the image (can be overridden by mounting)
COPY config.json ./

# Ensure logs dir exists at runtime
RUN mkdir -p /app/logs

ENV PORT=3128 \
    CONFIG=/app/config.json

EXPOSE 3128

CMD ["node", "proxy.js"]


