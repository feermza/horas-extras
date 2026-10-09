/**
 * Liquidación de un agente y mes (sección 9).
 * Aritmética exacta con BigInt. Sin coma flotante, DOM, archivos ni red.
 */

/**
 * Interpreta un valor hora decimal sin pasar por coma flotante.
 * Si llega como número, se convierte con String. Acepta punto o coma.
 *
 * @param {unknown} valor
 * @returns {{ entero: bigint, escala: number }}
 */
function parsearValorHora(valor) {
  const texto = typeof valor === "number" ? String(valor) : valor;
  if (typeof texto !== "string" || !/^\d+([.,]\d+)?$/.test(texto)) {
    throw new RangeError(
      "valorHoraBase debe ser un decimal no negativo, con punto o coma.",
    );
  }
  const partes = texto.split(/[.,]/);
  const fraccion = partes[1] ?? "";
  return {
    entero: BigInt(partes[0] + fraccion),
    escala: fraccion.length,
  };
}

/**
 * @param {unknown} minutos
 * @param {string} nombre
 * @returns {number}
 */
function exigirMinutos(minutos, nombre) {
  if (!Number.isSafeInteger(minutos) || minutos < 0) {
    throw new RangeError(`${nombre} debe ser un entero de minutos mayor o igual que 0.`);
  }
  return minutos;
}

/**
 * Techo de una división entera no negativa.
 *
 * @param {bigint} numerador
 * @param {bigint} denominador
 * @returns {bigint}
 */
function techoDivision(numerador, denominador) {
  if (numerador === 0n) {
    return 0n;
  }
  return (numerador + denominador - 1n) / denominador;
}

/**
 * Liquida minutos simples y dobles con un solo redondeo hacia arriba.
 *
 * @param {{ minutosSimples: number, minutosDobles: number, valorHoraBase: unknown }} entrada
 * @returns {{ minutosEquivalentes: number, importe: number }}
 */
export function liquidar(entrada) {
  const simples = exigirMinutos(entrada.minutosSimples, "minutosSimples");
  const dobles = exigirMinutos(entrada.minutosDobles, "minutosDobles");
  const equivalentes = simples + 2 * dobles;
  if (!Number.isSafeInteger(equivalentes)) {
    throw new RangeError("Los minutos equivalentes no caben en un entero seguro.");
  }
  const { entero, escala } = parsearValorHora(entrada.valorHoraBase);
  const denominador = 60n * (10n ** BigInt(escala));
  const importe = techoDivision(BigInt(equivalentes) * entero, denominador);
  if (importe > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("El importe no cabe en un entero seguro.");
  }
  return {
    minutosEquivalentes: equivalentes,
    importe: Number(importe),
  };
}
