FROM node:20-bookworm-slim AS base

# 1. 安裝 pnpm (避免 Corepack 在 CI/CD 容器中下載失敗的問題)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.15.9

# 2. 安裝 Python 3 與影像處理套件 (pdfplumber, pillow)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 建立獨立 Python 虛擬環境並安裝所需套件
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir pdfplumber pillow

ENV PATH="/opt/venv/bin:$PATH"

# 3. 安裝 Node.js 依賴
FROM base AS deps
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# 4. 編譯 Next.js 專案
FROM base AS builder
WORKDIR /app
COPY frontend/ ./
COPY --from=deps /app/node_modules ./node_modules

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# 5. 正式運行映像檔 (Production Runner)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 複製靜態資源與 standalone 執行檔
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 複製 Python 處理腳本與 OCR 模型檔（供後端 API 呼叫）
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/chi_tra.traineddata* ./

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
