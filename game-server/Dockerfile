# Build from monorepo root: docker build -f game-server/Dockerfile .
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/rules/package.json packages/rules/
COPY packages/duel-protocol/package.json packages/duel-protocol/
COPY game-server/package.json game-server/

RUN npm install --workspace=@optcg/rules --workspace=@optcg/duel-protocol --workspace=@optcg/game-server

COPY packages/rules packages/rules
COPY packages/duel-protocol packages/duel-protocol
COPY game-server game-server

ENV NODE_ENV=production
ENV PORT=2567
EXPOSE 2567

CMD ["npm", "run", "start", "-w", "@optcg/game-server"]
