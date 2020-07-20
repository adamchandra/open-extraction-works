FROM node:14-alpine

RUN apk update
RUN apk add bash
RUN apk add direnv --update-cache --repository http://dl-3.alpinelinux.org/alpine/edge/testing/ --allow-untrusted

RUN npm i -g lerna
RUN npm i -g rollup

# RUN mkdir -p /usr/src/app/logs
WORKDIR /usr/src/app

COPY package*.json ./
ADD lerna.json ./

# copy shell init files for convenience when attaching to containers
COPY docker/shared/root.profile /root/.bashrc

COPY workspaces/commons/package*.json ./workspaces/commons/
ADD workspaces/commons/src ./workspaces/commons/src
ADD workspaces/commons/@types ./workspaces/commons/@types
ADD workspaces/commons/rollup.config.js ./workspaces/commons/
ADD workspaces/commons/tsconfig.json ./workspaces/commons/

COPY workspaces/servers/package*.json ./workspaces/servers/
COPY workspaces/servers/tsconfig.json ./workspaces/servers/
ADD workspaces/servers/src ./workspaces/servers/src
ADD workspaces/servers/bin ./workspaces/servers/bin
COPY docker/shared/dot.envrc ./workspaces/servers/.envrc
RUN direnv allow ./workspaces/servers/.envrc

COPY workspaces/extraction-works/package*.json ./workspaces/extraction-works/
COPY workspaces/extraction-works/tsconfig.json ./workspaces/extraction-works/
ADD workspaces/extraction-works/@types ./workspaces/extraction-works/@types
ADD workspaces/extraction-works/src ./workspaces/extraction-works/src
ADD workspaces/extraction-works/bin ./workspaces/extraction-works/bin
COPY docker/shared/dot.envrc ./workspaces/extraction-works/.envrc
RUN direnv allow ./workspaces/extraction-works/.envrc

RUN lerna bootstrap
RUN lerna run build

# If you are building your code for production
# RUN npm ci --only=production

ENTRYPOINT ["node"]