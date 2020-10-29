#!/bin/bash

SCRIPT=$(readlink -f "$0")
BIN=$(dirname "$SCRIPT")
. $BIN/paths.sh

# DOCKER_BUILDKIT=1
docker build -t adamchandra/spider-works  git@github.com:adamchandra/spider-works.git

# lerna run rollup

# for imaged in $IMAGES/*
# imageDirs=('./docker/images/watr-front' './docker/images/spider-app')

imageDirs=('./docker/images/service-portal')

for imaged in ${imageDirs[@]};
do
    base=$(basename $imaged)
    tag="adamchandra/$base"
    dockerfile="$imaged/Dockerfile"

    echo "docker build -t $tag -f $dockerfile ."
    docker builder build -t $tag -f $dockerfile .
done
