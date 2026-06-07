# ---- build 階段：安裝全部依賴、用 tsc 編譯 TypeScript ----
FROM node:22-alpine AS builder

WORKDIR /app

# argon2 需要編譯工具
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 移除 devDependencies（保留已編譯的 argon2 原生模組），供 runtime 階段沿用
RUN npm prune --omit=dev

# ---- runtime 階段：只帶編譯產物與正式依賴 ----
FROM node:22-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
