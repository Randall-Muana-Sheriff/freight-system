#!/usr/bin/env bash
set -euo pipefail

# One-command launcher for Expo + Waydroid.
# Usage:
#   ./run-waydroid-expo.sh <WAYDROID_IP>
#   ./run-waydroid-expo.sh 192.168.240.112

APP_PACKAGE="host.exp.exponent"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAYDROID_IP="${1:-}"
LOG_FILE="${PROJECT_DIR}/.expo-waydroid.log"
METRO_PORT="8081"
STARTED_METRO=0

cd "${PROJECT_DIR}"

if ! command -v adb >/dev/null 2>&1; then
  echo "Error: adb is not installed or not in PATH."
  exit 1
fi

if [[ -n "${WAYDROID_IP}" ]]; then
  echo "Connecting to Waydroid at ${WAYDROID_IP}:5555 ..."
  adb connect "${WAYDROID_IP}:5555" >/dev/null || true
fi

if ! adb devices | grep -E "device$" >/dev/null 2>&1; then
  echo "Error: No authorized Android device found."
  echo "Tip: run 'adb devices' and ensure your Waydroid shows as 'device'."
  exit 1
fi

if ! adb shell pm list packages | grep -q "${APP_PACKAGE}"; then
  echo "Error: Expo Go is not installed on the device."
  echo "Install matching Expo Go first (SDK 53 -> Expo-Go-2.33.22.apk)."
  exit 1
fi

rm -f "${LOG_FILE}"
touch "${LOG_FILE}"

if ss -ltn 2>/dev/null | grep -q ":${METRO_PORT} "; then
  echo "Metro already running on port ${METRO_PORT}; reusing existing server."
  EXPO_PID="existing"
  HOST_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
  if [[ -z "${HOST_IP}" ]]; then
    echo "Error: Could not infer host IP for existing Metro instance."
    exit 1
  fi
  URL="exp://${HOST_IP}:${METRO_PORT}"
else
  echo "Starting Expo Metro (logs: ${LOG_FILE}) ..."
  CI=1 nohup npx expo start --port "${METRO_PORT}" >"${LOG_FILE}" 2>&1 &
  EXPO_PID=$!
  STARTED_METRO=1
  URL=""
fi

if [[ "${STARTED_METRO}" -eq 1 ]]; then
  echo "Waiting for exp:// URL from Metro ..."
  for _ in $(seq 1 120); do
    URL=$(grep -oE 'exp://[^[:space:]]+' "${LOG_FILE}" | head -n 1 || true)
    if [[ -n "${URL}" ]]; then
      break
    fi
    sleep 1
  done
fi

if [[ -z "${URL}" ]]; then
  HOST_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
  if [[ -n "${HOST_IP}" ]]; then
    URL="exp://${HOST_IP}:${METRO_PORT}"
    echo "Falling back to inferred URL: ${URL}"
  else
    echo "Error: Could not detect exp:// URL in time."
    echo "Check logs: ${LOG_FILE}"
    if [[ "${STARTED_METRO}" -eq 1 ]]; then
      kill "${EXPO_PID}" >/dev/null 2>&1 || true
    fi
    exit 1
  fi
fi

echo "Opening app URL in Expo Go: ${URL}"
adb shell am start -a android.intent.action.VIEW -d "${URL}" "${APP_PACKAGE}" >/dev/null

echo
echo "Done."
echo "Metro PID: ${EXPO_PID}"
if [[ "${STARTED_METRO}" -eq 1 ]]; then
  echo "Stop Metro with: kill ${EXPO_PID}"
else
  echo "Metro was already running; leave it as-is."
fi
echo "Follow logs with: tail -f ${LOG_FILE}"
