#!/bin/sh
# Kopierer spillet til en Windows-maskine (mappen C:\Julefrokost, planlagt opgave "Julefrokost") og genstarter det.
# Brug: ./deploy-windows.sh bruger@maskine   – eller sæt JF_HOST og evt. JF_KEY (SSH-nøgle) i filen deploy.local
# Festernes data (data/) og maskinens egne indstillinger (config.json) røres ikke.
set -e
cd "$(dirname "$0")"
[ -f deploy.local ] && . ./deploy.local
HOST="${1:-$JF_HOST}"
[ -n "$HOST" ] || { echo "Brug: $0 bruger@maskine (eller JF_HOST i deploy.local)"; exit 1; }
w() { ssh ${JF_KEY:+-i "$JF_KEY"} "$HOST" "$@"; }
w 'cmd /c "if not exist C:\Julefrokost mkdir C:\Julefrokost"'
COPYFILE_DISABLE=1 tar -cf - server.js lib public billeder tools README.md KILDER.md LICENSE LICENSER config.eksempel.json | w "tar -xf - -C C:/Julefrokost"
# cmd /c, så linjen virker, uanset om ssh lander i cmd eller PowerShell (PowerShell tillader ikke &)
w 'cmd /c "schtasks /end /tn Julefrokost >nul 2>nul & schtasks /run /tn Julefrokost"' || echo "Opgaven Julefrokost findes ikke endnu – opret den (se README.md)."
echo "Opdateret på $HOST"
