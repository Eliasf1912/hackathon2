// Ce qu'il faut regarder : Node écrit les noms des clés, met les chaînes entre quotes
// et ajoute des espaces après { et avant }.
// Lancer depuis la racine : node_modules/.bin/tsx <chemin>/exemple.ts
console.info({ id: "c1", client: { nom: "Alice" }, total: 1000000 });
// { id: 'c1', client: { nom: 'Alice' }, total: 1000000 }
