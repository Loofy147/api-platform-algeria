# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy built app
COPY dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
