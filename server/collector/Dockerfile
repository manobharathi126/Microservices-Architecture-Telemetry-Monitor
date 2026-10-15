FROM node:22-alpine

WORKDIR /app

COPY server/collector/package*.json ./
RUN npm ci --omit=dev

COPY server/collector/ ./

# Ensure the TiDB CA certificate is included
COPY server/collector/ca.pem ./ca.pem

CMD ["node", "index.js"]