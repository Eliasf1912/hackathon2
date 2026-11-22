# 01 · Mesures

**La question :** la boîte `UnionN` est-elle vraiment plus rapide qu'un conteneur `any` ?

```bash
cd mesures
go test -run x -bench . -benchmem   # les temps
go test -run TestMemorySizes -v     # les tailles
```

## Ce qui est comparé

| Banc | Ce qu'il fait |
|---|---|
| `BenchmarkUnionN_Typed` (retenu) | `addUnion` renvoie `Union2[EitherFail, EitherSuccess[float64]]`, on lit `V1.Value` |
| `BenchmarkAny_Dynamic` (écarté) | `addAny` renvoie `EitherAny{ Value any }`, on lit `v.(float64)` |
| `BenchmarkMap_Preallocated_100Elements` (retenu) | `make([]R, len(array))` puis on remplit par index |
| `BenchmarkMap_AppendDynamic_100Elements` (écarté) | on part d'une slice vide et on fait `append` |

## Résultats (relance du 20/11, Go 1.24.7, Intel Xeon 4 cœurs)

| Banc | Temps | Mémoire |
|---|---|---|
| `UnionN` | ~3,4 à 4,2 ns | 0 allocation |
| `any` | ~12 à 13,5 ns | 1 allocation (8 o) |
| `Map` préalloué, 100 éléments | ~305 à 312 ns | 1 allocation (896 o) |
| `Map` avec `append`, 100 éléments | ~713 à 752 ns | 8 allocations (2 040 o) |

Tailles : `Union2[EitherFail, EitherSuccess[float64]]` = 64 octets (`EitherFail` 24 o, `EitherSuccess[float64]` 32 o).

Une première mesure le même jour, sur une autre machine, donnait le même ordre (`UnionN` ~4,4 à 4,7 ns, `any` ~13 à 15 ns). Tout est dans [resultats.txt](resultats.txt).

## Ce qu'on en retient

- `UnionN` est environ **3 fois plus rapide** que `any` ici, et surtout **n'alloue rien** : c'est l'allocation qui coûte au ramasse-miettes dans un vrai programme.
- Préallouer une liste évite 7 allocations sur 8 et divise le temps par un peu plus de 2.
- Ce sont des **micro-mesures** : elles comparent deux pistes sur un calcul minuscule. Elles ne disent pas de combien un programme entier va plus vite.
