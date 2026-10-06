FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install --no-audit --no-fund && npm run build
ENV HUDDO_DAEMON=0
ENTRYPOINT ["node", "dist/huddo.mjs", "mcp"]
