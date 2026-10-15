FROM node:22-alpine

WORKDIR /app

COPY server/collector/package*.json ./
RUN npm ci --omit=dev

COPY server/collector/ ./

CMD ["node", "index.js"]
