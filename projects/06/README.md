# Projet 06

## Problématique

### Représenter et traiter des erreurs identifiées

Dans `add.ts`, un échec contient une information, `negative-operand`, ainsi que la valeur de l’opérande concerné. Dans `index.ts`, `DEither.matchInformation` choisit ensuite un traitement selon que le résultat porte cette information ou l’information `success`. Comment représenter des erreurs identifiées avec leur contexte, puis distinguer les variantes d’un résultat pour appliquer le traitement associé à chacune ?

### Traduire une expression ternaire

Dans `add.ts`, l’expression `one < 0 ? one : two` choisit une valeur selon une condition. TypeScript permet d’écrire cette sélection directement dans une expression, alors que Go ne possède pas d’opérateur ternaire. Comment traduire cette expression tout en conservant le choix de la branche et en produisant une valeur utilisable dans l’appel à `DEither.left` ?

## Limites

### Exhaustivité de `DEither.matchInformation`

```go
switch information {
case "negative-operand":
	message = negativeOperand()
case "success":
	message = success(value)
default:
	panic("matchInformation: unhandled information " + information)
}
```

`DEither.matchInformation` est traduit par un `switch` sur le champ `Information` du résultat, avec un `case` par information traitée. TypeScript vérifie à la compilation que chaque information possible du résultat a un traitement : oublier un cas est une erreur de typage. Go ne peut pas faire cette vérification, car le résultat est représenté par une interface et les informations par des chaînes. Le `default` déclenche donc un `panic` à l’exécution si une information non traitée atteint le `switch`. Cette situation ne peut pas se produire dans un programme accepté par TypeScript, mais le compilateur Go ne le garantit pas.
