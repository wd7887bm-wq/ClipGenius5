# syntax=docker/dockerfile:1
#
# ClipGenius - production image with the REAL processing toolchain baked in
# (Node + ffmpeg + Python + yt-dlp + faster-whisper). Optimized for Koyeb /
# any container platform. Deploy with: --git-builder docker

# ---- Build the Next.js app ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime: Node + ffmpeg + Python toolchain ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# System: ffmpeg (+ ffprobe), Python 3, pip
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python video/AI toolchain (faster-whisper model downloads on first captioning)
RUN pip3 install --no-cache-dir --break-system-packages \
      yt-dlp faster-whisper moviepy psycopg2-binary

# Production Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Built app artifacts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/tsconfig.json ./

RUN mkdir -p public/clips

EXPOSE 3000
CMD ["npm", "start"]
