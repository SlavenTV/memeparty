FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
COPY prisma prisma
RUN npm ci --ignore-scripts && npx prisma generate
COPY apps/server/src apps/server/src
COPY scripts/smoke-test.ts scripts/smoke-test.ts
ENV NODE_ENV=production
USER node
EXPOSE 3001
CMD ["sh","-c","npx prisma migrate deploy && npm start -w @memeparty/server"]
