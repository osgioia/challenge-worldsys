FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine AS production

RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf /tmp/*

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

RUN mkdir -p uploads/process uploads/processing uploads/processed uploads/error logs && \
    chown -R nodejs:nodejs uploads logs

USER nodejs

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "-r", "module-alias/register", "dist/main.js"]