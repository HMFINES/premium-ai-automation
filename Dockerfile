FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY . .

RUN addgroup -S elevatex && adduser -S elevatex -G elevatex
RUN chown -R elevatex:elevatex /app

USER elevatex
WORKDIR /app/backend

EXPOSE 4000

CMD ["node", "src/server.js"]
