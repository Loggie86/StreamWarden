FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY apps/api ./apps/api
COPY apps/dashboard ./apps/dashboard
COPY scripts/build-dashboard.mjs ./scripts/build-dashboard.mjs

RUN npm run dashboard:build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
