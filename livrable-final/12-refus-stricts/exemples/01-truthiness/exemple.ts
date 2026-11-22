// Ce qu'il faut regarder : en JS, `if (valeur)` teste la « truthiness ».
// 0, NaN et "" sont faux. Le transpileur refuse ce `if` : un-support-non-boolean-condition.

function describe(count: number) {
	if (count) { // ← refusé par le transpileur
		return "non nul";
	}
	return "nul ou NaN";
}

console.log(describe(3)); // non nul
console.log(describe(0)); // nul ou NaN
console.log(describe(NaN)); // nul ou NaN

// Ce que le développeur écrit à la place, accepté et sans ambiguïté :
function describeExplicit(count: number) {
	return count > 0 ? "positif" : "pas positif";
}
console.log(describeExplicit(3)); // positif
