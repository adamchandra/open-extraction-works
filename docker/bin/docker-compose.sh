#!/bin/sh

SCRIPT=$(readlink -f "$0")
BIN=$(dirname "$SCRIPT")
. $BIN/paths.sh

docker-compose \
    -f $COMPOSE/network.yml \
    -f $COMPOSE/volumes.yml \
    -f $COMPOSE/postgres.yml \
    $@

# -f $COMPOSE/watr-front.yml \
# -f $COMPOSE/filebeat.yml \


