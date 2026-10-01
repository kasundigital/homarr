#!/usr/bin/env bash
set -euo pipefail

cd /

INSTALL_DIR="${INSTALL_DIR:-/home/docker/homehub}"
IMAGE="${HOMEHUB_IMAGE:-ghcr.io/kasundigital/homehub:latest}"
PORT="${HOMEHUB_PORT:-7575}"
TZ_VALUE="${TZ:-Asia/Colombo}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root or with sudo."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required."
  exit 1
fi

mkdir -p "${INSTALL_DIR}/data"
chmod 700 "${INSTALL_DIR}"

ENV_FILE="${INSTALL_DIR}/.env"
COMPOSE_FILE="${INSTALL_DIR}/compose.yml"

if [[ -f "${COMPOSE_FILE}" ]]; then
  cp "${COMPOSE_FILE}" "${COMPOSE_FILE}.bak.$(date +%Y%m%d%H%M%S)"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  AUTH_SECRET="$(openssl rand -hex 32)"
  ENCRYPTION_KEY="$(openssl rand -hex 32)"

  cat >"${ENV_FILE}" <<EOF
AUTH_SECRET=${AUTH_SECRET}
SECRET_ENCRYPTION_KEY=${ENCRYPTION_KEY}
HOMEHUB_PORT=${PORT}
TZ=${TZ_VALUE}
EOF
  chmod 600 "${ENV_FILE}"
fi

cat >"${COMPOSE_FILE}" <<EOF
services:
  homehub:
    image: ${IMAGE}
    container_name: homehub
    restart: unless-stopped
    ports:
      - "${PORT}:7575"
    env_file:
      - ${ENV_FILE}
    environment:
      TZ: ${TZ_VALUE}
      AUTH_SECRET: ${AUTH_SECRET:-}
      SECRET_ENCRYPTION_KEY: ${SECRET_ENCRYPTION_KEY:-}
    volumes:
      - ${INSTALL_DIR}/data:/appdata
      - /var/run/docker.sock:/var/run/docker.sock
EOF

# Compose expands values from .env when run from the install directory.
cd "${INSTALL_DIR}"
docker compose pull
docker compose up -d --remove-orphans

echo
echo "HomeHub is starting."
echo "Open: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT}"
echo "Fallback: http://SERVER-IP:${PORT}"
echo "Data: ${INSTALL_DIR}/data"
echo "Config: ${COMPOSE_FILE}"
