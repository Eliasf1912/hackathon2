// Ce qu'il faut regarder : un tuple aux types mélangés.
// Le transpileur le refuse : un-support-heterogeneous-or-empty-tuple.
// Un tuple homogène ([number, number]) est accepté et devient [2]float64.

const accepted: readonly [number, number] = [1, 2];
const refused: readonly [number, string] = [1, "a"]; // ← refusé

console.log(JSON.stringify(accepted)); // [1,2]
console.log(JSON.stringify(refused)); // [1,"a"]
