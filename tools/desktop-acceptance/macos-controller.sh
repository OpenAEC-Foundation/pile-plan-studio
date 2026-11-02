#!/usr/bin/env bash
set -euo pipefail
# Only the disposable CI controller receives AX permission; never the product.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == macOS ]]
controller="$RUNNER_TEMP/pile-plan-ax-controller"
swiftc tools/desktop-acceptance/mac_ax.swift -o "$controller"
if ! printf '{"op":"trusted"}\n' | "$controller" | grep -q '"result":true'; then
  # Do not disable SIP. This setup works only on hosted images already configured
  # for UI testing. A secured/self-hosted machine must grant permission normally.
  csrutil status | grep -Eq 'status: (disabled|unknown)' || { echo 'Hosted image does not permit unattended AX setup'; exit 1; }
  sudo sqlite3 '/Library/Application Support/com.apple.TCC/TCC.db' \
    "INSERT OR REPLACE INTO access (service,client,client_type,auth_value,auth_reason,auth_version,indirect_object_identifier,flags,last_modified) VALUES ('kTCCServiceAccessibility','$controller',1,2,3,1,'UNUSED',0,CAST(strftime('%s','now') AS INTEGER));"
  sudo launchctl kickstart -k system/com.apple.tccd
fi
echo "AX_HELPER=$controller" >> "$GITHUB_ENV"
