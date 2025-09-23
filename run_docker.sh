#!/usr/bin/env sh
set -eu

IMAGE_NAME="forward-proxy:latest"
CONTAINER_NAME="forward-proxy"
PORT="3128"
CONFIG_PATH="$(pwd)/config.json"
ENV_PATH="$(pwd)/.env"
LOGS_DIR="$(pwd)/logs"

usage() {
  echo "Usage: $0 [-i image] [-n name] [-p port] [-c config.json] [-e .env] [-l logs_dir]"
  echo "  -i  Docker image name (default: ${IMAGE_NAME})"
  echo "  -n  Container name (default: ${CONTAINER_NAME})"
  echo "  -p  Host port to expose (default: ${PORT})"
  echo "  -c  Path to config.json to mount at /app/config.json (default: ./config.json)"
  echo "  -e  Path to .env to mount at /app/.env (default: ./.env)"
  echo "  -l  Path to logs directory to mount at /app/logs (default: ./logs)"
}

# Parse flags
while getopts ":i:n:p:c:e:l:h" opt; do
  case $opt in
    i) IMAGE_NAME=$OPTARG ;;
    n) CONTAINER_NAME=$OPTARG ;;
    p) PORT=$OPTARG ;;
    c) CONFIG_PATH=$OPTARG ;;
    e) ENV_PATH=$OPTARG ;;
    l) LOGS_DIR=$OPTARG ;;
    h) usage; exit 0 ;;
    :) echo "Option -$OPTARG requires an argument" >&2; usage; exit 1 ;;
    \?) echo "Invalid option: -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

# Resolve absolute paths if the utilities exist; otherwise, best-effort
resolve_path() {
  _p="$1"
  if [ -x "$(command -v realpath 2>/dev/null || true)" ]; then
    realpath "$_p"
  else
    # Fallback: prepend PWD if relative
    case "$_p" in
      /*) echo "$_p" ;;
      *)  echo "$(pwd)/$_p" ;;
    esac
  fi
}

CONFIG_ABS="$(resolve_path "$CONFIG_PATH")"
ENV_ABS="$(resolve_path "$ENV_PATH")"
LOGS_ABS="$(resolve_path "$LOGS_DIR")"

# Validate inputs
if [ ! -f "$CONFIG_ABS" ]; then
  echo "Error: config file not found: $CONFIG_ABS" >&2
  exit 1
fi
if [ ! -f "$ENV_ABS" ]; then
  echo "Error: .env file not found: $ENV_ABS" >&2
  exit 1
fi
mkdir -p "$LOGS_ABS"

# Build image
echo "Building image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" .

# If container exists (stopped or running), remove it before run
if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}$"; then
  echo "Removing existing container: $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

# Run container with mounts
echo "Running container: $CONTAINER_NAME on port $PORT"
docker run \
  --name "$CONTAINER_NAME" \
  -p "$PORT:3128" \
  -v "$CONFIG_ABS:/app/config.json:ro" \
  -v "$ENV_ABS:/app/.env:ro" \
  -v "$LOGS_ABS:/app/logs" \
  -e PORT=3128 \
  -e CONFIG=/app/config.json \
  "$IMAGE_NAME"
