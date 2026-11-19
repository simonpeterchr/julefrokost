#!/bin/sh
# Mac: dobbeltklik for at starte Julefrokost. Luk vinduet for at stoppe.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Node.js mangler. Hent det på https://nodejs.org og prøv igen."; read -r _; exit 1; fi
(sleep 1; open "http://localhost:${PORT:-8080}") &
exec node server.js
