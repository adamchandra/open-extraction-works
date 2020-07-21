FROM node:14-alpine

RUN apk update

RUN apk add bash tree
RUN apk add direnv --update-cache --repository http://dl-3.alpinelinux.org/alpine/edge/testing/ --allow-untrusted

RUN npm i -g lerna
RUN npm i -g rollup

WORKDIR /usr/src/app/watr-front

COPY package*.json ./
COPY lerna.json ./lerna.json

# copy shell init files for convenience when attaching to containers
COPY docker/shared/root.profile /root/.bashrc

RUN npm install 

COPY workspaces/commons ./workspaces/commons
COPY docker/shared/dot.envrc ./workspaces/commons/.envrc
RUN direnv allow ./workspaces/commons
RUN cd workspaces/commons && npm install 
RUN cd workspaces/commons && rollup -c  

COPY workspaces/services ./workspaces/services
COPY docker/shared/dot.envrc ./workspaces/services/.envrc
RUN direnv allow ./workspaces/services

RUN mkdir ./workspaces/services/node_modules
RUN cd ./workspaces/services/node_modules && ln -s ../../commons .
RUN cd ./workspaces/services && npm install
RUN cd ./workspaces/services/node_modules && ln -s ../../commons .
RUN cd ./workspaces/services && rollup -c

# RUN ls -thaFl --color .
# RUN /usr/bin/tree -Ca -I 'target|.git' -L 3 workspaces

# If you are building your code for production
# RUN npm ci --only=production

WORKDIR /usr/src/app/watr-front/workspaces/services

ENTRYPOINT ["node", "./dist/bundle.js"]

