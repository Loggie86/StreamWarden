FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY packages/policy-engine ./packages/policy-engine
COPY apps/addon ./apps/addon

ENV HOST=0.0.0.0
ENV PORT=7000
EXPOSE 7000

CMD ["node", "--experimental-strip-types", "apps/addon/src/server.ts"]
