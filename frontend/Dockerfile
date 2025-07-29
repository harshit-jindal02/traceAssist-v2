# frontend/Dockerfile
FROM node:18-alpine
WORKDIR /app

# Copy just package files, install deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy your React/Vite app
COPY . .

# Start dev server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
