FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY src ./src
COPY assets ./assets

EXPOSE 3000

CMD ["node", "src/server.js"]
