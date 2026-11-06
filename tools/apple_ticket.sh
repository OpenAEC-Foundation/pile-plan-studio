#!/usr/bin/env bash
# Source this helper; it preserves failures after a bounded ticket-delivery retry.
apple_ticket() {
  local action="${1:?}" path="${2:?}" attempt status
  [[ "$action" == staple || "$action" == validate ]] || return 64
  for attempt in 1 2 3; do
    if xcrun stapler "$action" "$path"; then
      return 0
    else
      status=$?
    fi
    if [[ "$status" != 68 && "$status" != 65 ]] || [[ "$attempt" -eq 3 ]]; then
      return "$status"
    fi
    echo "Apple ticket $action failed ($status); retrying ticket delivery."
    sleep "$((attempt * 15))"
  done
}
