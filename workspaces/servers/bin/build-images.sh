#!/bin/bash

SCRIPT=$(readlink -f "$0")
BIN=$(dirname "$SCRIPT")
. $BIN/paths.sh

DOCKER_BUILDKIT=1

docker --log-level=debug build -t adamchandra/rest-portal -f $IMAGES/rest-portal/Dockerfile $PRJ_ROOT
docker --log-level=debug build -t adamchandra/filebeat -f $IMAGES/filebeat/Dockerfile $PRJ_ROOT
