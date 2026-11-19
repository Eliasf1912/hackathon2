#!/usr/bin/env bash

# Banc de tests de sortie : pour chaque cas, traduit le programme TypeScript en Go,
# compile et exécute le Go, puis compare sa sortie à celle de TypeScript (tsx),
# au caractère près.
#
# Cas testés :
#   - les exercices projects/00 à projects/12 ;
#   - les copies de .commands/output-cases/ (chemins d'échec et variantes des exercices).
#
# Usage : ./.commands/test-outputs.sh [-v] [dossier…]
#   -v      : affiche le diff TypeScript / Go des cas différents.
#   dossier : ne teste que ces cas (chacun contient index.ts et tsconfig.json) ;
#             utilisé par le stress test. Sans dossier : exercices et output-cases.
#
# Le go.mod généré demande une version de Go précise : il est aligné sur la version
# installée (GOTOOLCHAIN=local) pour ne pas déclencher de téléchargement.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERBOSE=""

if [ "${1:-}" = "-v" ]; then
	VERBOSE="-v"
	shift
fi

TSX="$ROOT/node_modules/.bin/tsx"
GO_VERSION="$(go env GOVERSION | sed 's/^go//')"

identical=0
different=0
goFailed=0
translationFailed=0
total=0

runCase() {
	local caseDirectory="$1"
	local label="$2"
	local workDirectory
	workDirectory="$(mktemp -d)"
	total=$((total + 1))

	if ! (cd "$ROOT" && "$TSX" --tsconfig tsconfig.app.json bin/index.ts \
		--tsconfig "$caseDirectory/tsconfig.json" \
		--input "$caseDirectory/index.ts" \
		--output "$workDirectory/go") > "$workDirectory/translation.log" 2>&1; then
		translationFailed=$((translationFailed + 1))
		echo "TRADUCTION KO  $label"
		rm -rf "${workDirectory:?}"
		return
	fi

	(cd "$workDirectory/go" && go mod edit -go="$GO_VERSION")

	local goOutput
	local goStatus
	goOutput="$(cd "$workDirectory/go" && GOTOOLCHAIN=local go run . 2>&1)"
	goStatus=$?

	local typescriptOutput
	typescriptOutput="$(cd "$caseDirectory" && "$TSX" index.ts 2>&1)"

	if [ "$goStatus" -ne 0 ]; then
		goFailed=$((goFailed + 1))
		echo "GO KO          $label"
		[ "$VERBOSE" = "-v" ] && echo "$goOutput" | head -5
	elif [ "$goOutput" = "$typescriptOutput" ]; then
		identical=$((identical + 1))
		echo "IDENTIQUE      $label"
	else
		different=$((different + 1))
		echo "DIFFÉRENT      $label"
		[ "$VERBOSE" = "-v" ] && diff <(echo "$typescriptOutput") <(echo "$goOutput") | head -10
	fi

	rm -rf "${workDirectory:?}"
}

if [ "$#" -gt 0 ]; then
	for caseDirectory in "$@"; do
		runCase "$(cd "$caseDirectory" && pwd)" "cas $(basename "$caseDirectory")"
	done
else
	for project in "$ROOT"/projects/*/; do
		runCase "${project%/}" "exercice $(basename "$project")"
	done

	for outputCase in "$ROOT"/.commands/output-cases/*/; do
		runCase "${outputCase%/}" "cas $(basename "$outputCase")"
	done
fi

echo
echo "$identical/$total identiques | $different différents (format ou données) | $goFailed Go KO | $translationFailed traduction KO"

[ "$identical" -eq "$total" ]
