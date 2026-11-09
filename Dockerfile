FROM node:22-alpine AS api-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS api-production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM node:22-alpine AS api

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=api-production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=api-build /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]

FROM nginx:1.27-alpine AS frontend

COPY frontend/index.html frontend/app.js frontend/styles.css /usr/share/nginx/html/
