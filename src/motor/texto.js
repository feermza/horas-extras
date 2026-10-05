/**
 * Normalización de texto para comparar nombres, observaciones y catálogos.
 * Función pura: sin DOM, archivos ni red.
 */

/**
 * Normaliza un texto para comparación (sección 6.1).
 *
 * Pasos, en este orden:
 * 1. null o undefined devuelven "". Cualquier otro valor que no sea
 *    string se convierte con String().
 * 2. Mayúsculas, con el mapeo Unicode (no depende del idioma del sistema).
 * 3. Descomposición NFD y eliminación de marcas (\p{M}).
 *    Esto también convierte Ñ en N.
 * 4. Cada tramo que no sea letra ni dígito pasa a ser un espacio.
 * 5. Se colapsan los espacios repetidos y se recortan los extremos.
 *
 * Es idempotente: normalizar dos veces da el mismo resultado que una.
 *
 * @param {unknown} texto
 * @returns {string}
 */
export function normalizarTexto(texto) {
  if (texto === null || texto === undefined) {
    return "";
  }
  const cadena = typeof texto === "string" ? texto : String(texto);
  return cadena
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}
