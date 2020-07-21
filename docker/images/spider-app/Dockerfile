FROM adamchandra/spider-works as spider_img
FROM adamchandra/watr-front as node_img

COPY --from=spider_img /usr/src/app/spider-works /usr/src/app/spider-works

WORKDIR /usr/src/app/watr-front/workspaces/services
ENTRYPOINT ["node", "./dist/bundle.js"]