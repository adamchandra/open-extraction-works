FROM node:14

RUN apt-get update

RUN apt-get --yes install bash tree direnv

RUN npm i -g lerna
RUN npm i -g rollup

WORKDIR /usr/src/app/service-portal
RUN pwd  

COPY package*.json ./
COPY lerna.json ./lerna.json

# copy shell init files for convenience when attaching to containers
COPY docker/shared/root.profile /root/.bashrc


COPY workspaces/commons ./workspaces/commons
COPY docker/shared/dot.envrc ./workspaces/commons/.envrc
RUN direnv allow ./workspaces/commons

COPY workspaces/services ./workspaces/services
COPY docker/shared/dot.envrc ./workspaces/services/.envrc
RUN direnv allow ./workspaces/services

RUN lerna bootstrap 

WORKDIR /usr/src/app/service-portal/workspaces/commons

RUN rollup -c  

WORKDIR /usr/src/app/service-portal/workspaces/services

RUN rollup -c  


# RUN ls -thaFl --color .
# RUN /usr/bin/tree -Ca -I 'target|.git' -L 3 workspaces

# If you are building your code for production
# RUN npm ci --only=production

WORKDIR /usr/src/app/service-portal/workspaces/services

ENTRYPOINT ["node", "./dist/bundle.js"]

