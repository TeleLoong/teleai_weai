#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${ROOT_DIR}/_config.yml"
MANAGER_PID_FILE="/tmp/al-folio-jekyll-manager.pid"
WAIT_TIMEOUT_SECONDS=1200
WAIT_INTERVAL_SECONDS=5
JEKYLL_CMD=(
  bundle
  exec
  jekyll
  serve
  --watch
  --port=8080
  --host=0.0.0.0
  --livereload
  --verbose
  --trace
  --force_polling
)

jekyll_pid=""
config_state=""

log() {
  printf '[entry-point] %s\n' "$*"
}

cleanup() {
  stop_jekyll
  rm -f "${MANAGER_PID_FILE}"
}

trap cleanup EXIT INT TERM

manage_gemfile_lock() {
  git config --global --add safe.directory '*' >/dev/null 2>&1 || true

  if [[ -f "${ROOT_DIR}/Gemfile.lock" ]]; then
    if git -C "${ROOT_DIR}" ls-files --error-unmatch Gemfile.lock >/dev/null 2>&1; then
      log "Gemfile.lock is tracked by git; restoring tracked contents."
      git -C "${ROOT_DIR}" restore Gemfile.lock >/dev/null 2>&1 || true
    else
      log "Gemfile.lock is not tracked by git; removing it before install."
      rm -f "${ROOT_DIR}/Gemfile.lock"
    fi
  fi
}

bundle_check() {
  (cd "${ROOT_DIR}" && bundle check >/dev/null 2>&1)
}

read_config_state() {
  stat -c '%y' "${CONFIG_FILE}" 2>/dev/null || echo "missing"
}

bundle_install_in_progress() {
  local pid

  while IFS= read -r pid; do
    [[ -z "${pid}" || "${pid}" == "$$" ]] && continue

    if [[ "$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)" != "${ROOT_DIR}" ]]; then
      continue
    fi

    return 0
  done < <(pgrep -f "bundle install" || true)

  return 1
}

wait_for_dependencies() {
  local start_time elapsed

  manage_gemfile_lock
  if bundle_check; then
    return 0
  fi

  start_time="$(date +%s)"

  while bundle_install_in_progress; do
    elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= WAIT_TIMEOUT_SECONDS )); then
      log "Timed out after ${WAIT_TIMEOUT_SECONDS}s waiting for bundle install to finish."
      return 1
    fi

    log "Waiting for the dev container post-create bundle install to finish (${elapsed}s elapsed)."
    sleep "${WAIT_INTERVAL_SECONDS}"

    if bundle_check; then
      return 0
    fi
  done

  if bundle_check; then
    return 0
  fi

  log "Dependencies are still missing; running bundle install from the manager."
  (cd "${ROOT_DIR}" && bundle install)

  if ! bundle_check; then
    log "bundle check still fails after bundle install."
    return 1
  fi
}

stop_jekyll() {
  if [[ -z "${jekyll_pid}" ]]; then
    return 0
  fi

  if ! kill -0 "${jekyll_pid}" 2>/dev/null; then
    jekyll_pid=""
    return 0
  fi

  log "Stopping Jekyll (PID ${jekyll_pid})."
  kill "${jekyll_pid}" 2>/dev/null || true

  for _ in $(seq 1 10); do
    if ! kill -0 "${jekyll_pid}" 2>/dev/null; then
      jekyll_pid=""
      return 0
    fi

    sleep 1
  done

  log "Jekyll did not stop gracefully; sending SIGKILL."
  kill -KILL "${jekyll_pid}" 2>/dev/null || true
  wait "${jekyll_pid}" 2>/dev/null || true
  jekyll_pid=""
}

start_jekyll() {
  wait_for_dependencies

  log "Starting Jekyll on http://localhost:8080."
  (
    cd "${ROOT_DIR}"
    "${JEKYLL_CMD[@]}"
  ) &
  jekyll_pid=$!

  sleep 5
  if ! kill -0 "${jekyll_pid}" 2>/dev/null; then
    local status=1
    wait "${jekyll_pid}" || status=$?
    log "Jekyll exited during startup with status ${status}."
    return "${status}"
  fi

  log "Jekyll is running with PID ${jekyll_pid}."
}

log "Starting Jekyll manager."
echo "$$" >"${MANAGER_PID_FILE}"
config_state="$(read_config_state)"
start_jekyll

while true; do
  sleep "${WAIT_INTERVAL_SECONDS}"

  current_config_state="$(read_config_state)"
  if [[ "${current_config_state}" != "${config_state}" ]]; then
    config_state="${current_config_state}"
    log "Detected change to ${CONFIG_FILE}; restarting Jekyll."
    stop_jekyll
    start_jekyll
  fi

  if ! kill -0 "${jekyll_pid}" 2>/dev/null; then
    jekyll_status=1
    wait "${jekyll_pid}" || jekyll_status=$?
    log "Jekyll exited unexpectedly with status ${jekyll_status}."
    exit "${jekyll_status}"
  fi
done
