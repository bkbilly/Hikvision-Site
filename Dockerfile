# ==========================================
# Stage 1: Build Modern React Frontend
# ==========================================
FROM node:22-alpine AS frontend-builder
WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Unified Standalone Go Binary
# ==========================================
FROM golang:1.26-alpine AS backend-builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Copy built frontend assets into web/dist
COPY --from=frontend-builder /app/web/dist ./web/dist

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o hikvision-hub .

# ==========================================
# Stage 3: Minimal Production Image
# ==========================================
FROM alpine:3.20

RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    ffmpeg \
    mesa-va-gallium \
    libva-intel-driver

WORKDIR /app

# Copy binary from backend builder
COPY --from=backend-builder /app/hikvision-hub /app/hikvision-hub

# Create persistent data directory
RUN mkdir -p /app/data /mnt/cctv

ENV PORT=8080
ENV DATA_DIR=/app/data
ENV INITIAL_USER=admin
ENV INITIAL_PASS=admin

EXPOSE 8080

VOLUME ["/app/data", "/mnt/cctv"]

ENTRYPOINT ["/app/hikvision-hub"]
