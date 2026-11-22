#!/usr/bin/env bash
# Mini-banc, sur le modèle de .commands/test-outputs.sh :
# lance le programme TypeScript, puis chaque traduction Go,
# et compare les sorties CARACTÈRE PAR CARACTÈRE.
# Prérequis : Node 22+, tsx et @duplojs/lang installés, Go 1.22+.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

npx tsx "$HERE/01-traduction-juste/exemple.ts" > "$WORK/ts.txt"

for translation in 01-traduction-juste 02-traduction-fausse; do
	if ! go run "$HERE/$translation/exemple.go" > "$WORK/go.txt" 2>&1; then
		echo "GO KO        $translation"
	elif diff -q "$WORK/ts.txt" "$WORK/go.txt" > /dev/null; then
		echo "IDENTIQUE    $translation"
	else
		echo "DIFFÉRENT    $translation"
		diff "$WORK/ts.txt" "$WORK/go.txt" | sed 's/^/             /'
	fi
done
