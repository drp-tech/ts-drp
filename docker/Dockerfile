FROM node:22.3-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g corepack typescript@5.7.3
RUN corepack enable

WORKDIR /ts-drp
COPY . .

RUN pnpm i --prod
RUN chmod +x /ts-drp/docker/entrypoint.sh

ENTRYPOINT ["/bin/bash", "/ts-drp/docker/entrypoint.sh"]
