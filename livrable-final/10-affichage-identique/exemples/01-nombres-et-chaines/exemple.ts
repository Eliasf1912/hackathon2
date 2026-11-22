// Ce qu'il faut regarder : Node écrit 1000000 (pas 1e+06), NaN sans erreur,
// et choisit la quote d'une chaîne selon son contenu (' par défaut, " si le texte contient ').
// Lancer depuis la racine : node_modules/.bin/tsx <chemin>/exemple.ts
console.info(1000000); // 1000000
console.info(0.0000001); // 1e-7
console.info(NaN); // NaN
console.info(["bonjour"]); // [ 'bonjour' ]
console.info(["l'eau"]); // [ "l'eau" ]
