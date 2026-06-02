FROM node:20-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend dependencies
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev

# Copy all frontend files
COPY index.html ./index.html
COPY scriptmaker.html ./scriptmaker.html
COPY lib/ ./lib/

# Copy backend source
COPY backend/ ./backend/

EXPOSE 3000

CMD ["node", "backend/server.js"]
