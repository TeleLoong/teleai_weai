#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANAGER_PID_FILE="/tmp/al-folio-jekyll-manager.pid"
MANAGER_LOG_FILE="/tmp/al-folio-jekyll-manager.log"

log() {
  printf '[post-attach] %s\n' "$*"
}

start_manager() {
  if command -v setsid >/dev/null 2>&1; then
    setsid "${ROOT_DIR}/bin/entry_point.sh" </dev/null >>"${MANAGER_LOG_FILE}" 2>&1 &
  else
    nohup "${ROOT_DIR}/bin/entry_point.sh" </dev/null >>"${MANAGER_LOG_FILE}" 2>&1 &
  fi

  manager_pid=$!
}

manager_running() {
  if [[ ! -f "${MANAGER_PID_FILE}" ]]; then
    return 1
  fi

  local pid
  pid="$(<"${MANAGER_PID_FILE}")"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

existing_manager_pid() {
  local pid

  while IFS= read -r pid; do
    [[ -z "${pid}" || "${pid}" == "$$" ]] && continue
    printf '%s\n' "${pid}"
    return 0
  done < <(pgrep -f "${ROOT_DIR}/bin/entry_point.sh" || true)

  return 1
}

# Stabilize Ruby LSP startup: prevent composed bundle auto-updates from running
# on attach (which can cause noisy popups if dependency resolution fails).
"${ROOT_DIR}/bin/ruby_lsp_bootstrap.sh"

if manager_running; then
  log "Jekyll manager already running (PID $(<"${MANAGER_PID_FILE}"))."
  exit 0
fi

if existing_pid="$(existing_manager_pid)"; then
  echo "${existing_pid}" >"${MANAGER_PID_FILE}"
  log "Adopted existing Jekyll manager process (PID ${existing_pid})."
  exit 0
fi

rm -f "${MANAGER_PID_FILE}"

log "Starting Jekyll manager in the background. Logs: ${MANAGER_LOG_FILE}"
start_manager
echo "${manager_pid}" >"${MANAGER_PID_FILE}"

sleep 1
if ! kill -0 "${manager_pid}" 2>/dev/null; then
  log "Jekyll manager exited during startup. See ${MANAGER_LOG_FILE}."
  rm -f "${MANAGER_PID_FILE}"
  exit 1
fi

log "Jekyll manager started with PID ${manager_pid}."
