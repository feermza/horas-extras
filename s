[35msrc/motor/calculoDia.js[m[36m:[m[32m152[m[36m:[m * @param {Array<{ ingreso?: unknown, salida?: unknown }>} [1;31mmarcaciones[m
[35msrc/motor/calculoDia.js[m[36m:[m[32m161[m[36m:[mexport function tiempoTrabajado([1;31mmarcaciones[m) {
[35msrc/motor/calculoDia.js[m[36m:[m[32m162[m[36m:[m  exigirArreglo([1;31mmarcaciones[m, "[1;31mmarcaciones[m");
[35msrc/motor/calculoDia.js[m[36m:[m[32m166[m[36m:[m  for (let i = 0; i < [1;31mmarcaciones[m.length; i += 1) {
[35msrc/motor/calculoDia.js[m[36m:[m[32m167[m[36m:[m    const par = [1;31mmarcaciones[m[i];
[35msrc/motor/calculoDia.js[m[36m:[m[32m168[m[36m:[m    exigirObjeto(par, `[1;31mmarcaciones[m[${i}]`);
[35msrc/motor/calculoDia.js[m[36m:[m[32m495[m[36m:[m *   [1;31mmarcaciones[m: Array<{ ingreso?: unknown, salida?: unknown }>,
[35msrc/motor/calculoDia.js[m[36m:[m[32m496[m[36m:[m *   [1;31mobservacion[m?: unknown,
[35msrc/motor/calculoDia.js[m[36m:[m[32m511[m[36m:[m  const reconocimiento = reconocerNovedad(entrada.[1;31mobservacion[m, entrada.catalogo);
[35msrc/motor/calculoDia.js[m[36m:[m[32m516[m[36m:[m  const tiempo = tiempoTrabajado(entrada.[1;31mmarcaciones[m);
[35msrc/motor/calculoMes.js[m[36m:[m[32m236[m[36m:[m        [1;31mmarcaciones[m: fila?.[1;31mmarcaciones[m ?? [],
[35msrc/motor/calculoMes.js[m[36m:[m[32m237[m[36m:[m        [1;31mobservacion[m: fila?.[1;31mobservacion[m ?? "",
