FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm install
RUN npm --prefix frontend install

# Copy source
COPY . .

# Build frontend and TypeScript backend
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/server.js"]
