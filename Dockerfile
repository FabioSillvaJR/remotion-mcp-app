FROM node:20-bookworm-slim

# Install Chromium and required system libraries for Remotion rendering
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Remotion/Puppeteer where Chrome is and skip auto-download
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV REMOTION_CHROMIUM_PATH=/usr/bin/chromium
# Required when Chrome runs as root inside Docker
ENV REMOTION_DISABLE_SANDBOX=1

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Ensure the output volume mount-point exists
RUN mkdir -p /data-criacoes

CMD ["npm", "start"]
