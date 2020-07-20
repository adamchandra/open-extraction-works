#!/bin/bash

SCRIPT=$(readlink -f "$0")
BIN=$(dirname "$SCRIPT")
. $BIN/paths.sh

DOCKER_BUILDKIT=1

docker builder build -t adamchandra/spider-app $tag git@github.com:adamchandra/spider-works.git

for imaged in $IMAGES/*
do
    base=$(basename $imaged)
    tag="adamchandra/$base"
    dockerfile="$imaged/Dockerfile"

    echo "docker builder build -t $tag -f $dockerfile ."
    docker builder build -t $tag -f $dockerfile .
done
