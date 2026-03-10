FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src/ src/

# Build
RUN npx tsc

# Persist auth + sessions across restarts
VOLUME /app/data

# Pi needs a working directory — default to /workspace
RUN mkdir -p /workspace
ENV AGENT_CWD=/workspace

CMD ["node", "dist/index.js"]
