FROM node:14-alpine

# RUN apk update 
RUN npm i -g lerna 
RUN npm i -g rollup 

RUN mkdir -p /usr/src/app/logs
WORKDIR /usr/src/app

COPY package*.json ./
ADD lerna.json ./

# copy shell init files for convenience when attaching to containers
COPY docker/shared/root.profile /root/.profile

COPY workspaces/commons/package*.json ./workspaces/commons/
ADD workspaces/commons/src ./workspaces/commons/src
ADD workspaces/commons/@types ./workspaces/commons/@types
ADD workspaces/commons/rollup.config.js ./workspaces/commons/
ADD workspaces/commons/tsconfig.json ./workspaces/commons/

COPY workspaces/servers/package*.json ./workspaces/servers/
COPY workspaces/servers/tsconfig.json ./workspaces/servers/
ADD workspaces/servers/src ./workspaces/servers/src

COPY workspaces/extraction-works/package*.json ./workspaces/extraction-works/
COPY workspaces/extraction-works/tsconfig.json ./workspaces/extraction-works/
ADD workspaces/extraction-works/src ./workspaces/extraction-works/src

RUN lerna bootstrap
RUN lerna run build 

# If you are building your code for production
# RUN npm ci --only=production

ENTRYPOINT ["node"]