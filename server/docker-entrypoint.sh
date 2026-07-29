#!/bin/sh
set -eu

# New SQLite, upload, and NotebookLM session files must be private by default.
umask 077

app_data_dir="${APP_DATA_DIR:-/app/data}"
notebooklm_session_dir="${NOTEBOOKLM_SESSION_DIR:-/app/notebooklm-session}"
notebooklm_storage_path="${NOTEBOOKLM_STORAGE_PATH:-${notebooklm_session_dir}/storage_state.json}"

require_private_directory() {
  directory="$1"
  label="$2"

  case "$directory" in
    /*) ;;
    *)
      echo "$label must be an absolute path: $directory" >&2
      exit 64
      ;;
  esac

  case "$directory" in
    /)
      echo "$label must not be the filesystem root" >&2
      exit 64
      ;;
  esac

  if [ -L "$directory" ]; then
    echo "$label must not be a symbolic link: $directory" >&2
    exit 64
  fi

  mkdir -p "$directory"
  chmod 0700 "$directory"
  find "$directory" -xdev -type d -exec chmod 0700 {} \;
  find "$directory" -xdev -type f -exec chmod 0600 {} \;
}

case "$notebooklm_storage_path" in
  "$notebooklm_session_dir"/*) ;;
  *)
    echo "NOTEBOOKLM_STORAGE_PATH must be inside NOTEBOOKLM_SESSION_DIR" >&2
    exit 64
    ;;
esac

require_private_directory "$app_data_dir" "APP_DATA_DIR"
require_private_directory "$notebooklm_session_dir" "NOTEBOOKLM_SESSION_DIR"

if [ "$(id -u)" -eq 0 ]; then
  # Bind mounts arrive with host ownership. Limit ownership changes to real
  # files/directories in the two dedicated mounts, then permanently drop root.
  find "$app_data_dir" -xdev \( -type d -o -type f \) \
    -exec chown node:node {} \;
  find "$notebooklm_session_dir" -xdev \( -type d -o -type f \) \
    -exec chown node:node {} \;
  exec su-exec node:node "$@"
fi

exec "$@"
