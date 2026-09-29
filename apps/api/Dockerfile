FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY apps/api ./apps/api

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
