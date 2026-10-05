/**
 * Utilidades de tiempo del motor.
 * Todo valor es un entero de minutos. Sin Date, DOM, archivos ni red.
 */

/** Minutos de un día, de 00:00 inclusive a 24:00 exclusive. */
const MINUTOS_DIA = 1440;

/** Hora del día: "H:MM", "HH:MM" o con segundos "H:MM:SS" / "HH:MM:SS". */
const RE_HORA = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Duración sin tope de horas: "H:MM", "HH:MM" o más dígitos de hora. */
const RE_DURACION = /^(\d+):(\d{2})$/;

/**
 * Interpreta una hora del día como minutos desde las 00:00.
 * Acepta "H:MM", "HH:MM" y la misma forma con segundos ("HH:MM:SS").
 * Los segundos se truncan al minuto (supuesto 8); no se redondean.
 * No lanza: un valor inválido devuelve null.
 *
 * @param {unknown} texto
 * @returns {number|null} Entero entre 0 y 1439, o null si es inválido.
 */
export function parsearHora(texto) {
  if (typeof texto !== "string") {
    return null;
  }
  const coincidencia = RE_HORA.exec(texto);
  if (coincidencia === null) {
    return null;
  }
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  const segundos = coincidencia[3] === undefined ? 0 : Number(coincidencia[3]);
  if (horas > 23 || minutos > 59 || segundos > 59) {
    return null;
  }
  return horas * 60 + minutos;
}

/**
 * Interpreta una duración "H:MM" como minutos enteros.
 * Las horas no tienen tope de 23; los minutos van de 00 a 59.
 * No acepta segundos. No lanza: un valor inválido devuelve null.
 *
 * @param {unknown} texto
 * @returns {number|null} Entero mayor o igual que 0, o null si es inválido.
 */
export function parsearDuracion(texto) {
  if (typeof texto !== "string") {
    return null;
  }
  const coincidencia = RE_DURACION.exec(texto);
  if (coincidencia === null) {
    return null;
  }
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  if (!Number.isSafeInteger(horas) || minutos > 59) {
    return null;
  }
  const total = horas * 60 + minutos;
  if (!Number.isSafeInteger(total)) {
    return null;
  }
  return total;
}

/**
 * Muestra minutos enteros como "H:MM".
 * Las horas no llevan cero a la izquierda; los minutos siempre tienen dos dígitos.
 *
 * @param {number} minutos Entero mayor o igual que 0.
 * @returns {string}
 * @throws {RangeError} Si el valor no es un entero seguro mayor o igual que 0.
 */
export function formatearHM(minutos) {
  if (!Number.isSafeInteger(minutos) || minutos < 0) {
    throw new RangeError(
      "Se esperaba un entero de minutos mayor o igual que 0.",
    );
  }
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas}:${String(resto).padStart(2, "0")}`;
}

/**
 * Exige un minuto del día. parsearHora devuelve null si el texto es inválido;
 * quien llame a duracionPar o intervaloDePar tiene que descartar ese null antes.
 *
 * @param {unknown} minutos
 * @param {string} nombre Nombre del argumento, para el mensaje de error.
 * @returns {asserts minutos is number}
 */
function exigirMinutoDelDia(minutos, nombre) {
  if (!Number.isInteger(minutos) || minutos < 0 || minutos >= MINUTOS_DIA) {
    throw new RangeError(`${nombre} debe ser un entero entre 0 y 1439.`);
  }
}

/**
 * Duración de un par ingreso-salida, en minutos.
 * Si la salida es anterior al ingreso, el par cruza la medianoche.
 *
 * @param {number} ingreso Entero entre 0 y 1439.
 * @param {number} salida Entero entre 0 y 1439.
 * @returns {number} Entero mayor o igual que 0. Cero si ambos coinciden.
 * @throws {RangeError} Si ingreso o salida no son enteros entre 0 y 1439.
 */
export function duracionPar(ingreso, salida) {
  exigirMinutoDelDia(ingreso, "ingreso");
  exigirMinutoDelDia(salida, "salida");
  if (salida >= ingreso) {
    return salida - ingreso;
  }
  return salida + MINUTOS_DIA - ingreso;
}

/**
 * Proyecta un par sobre un eje continuo de minutos, contado desde
 * las 00:00 de la fecha de la marcación de ingreso.
 * Si hay cruce de medianoche, el fin queda en el día siguiente
 * (puede ser mayor que 1440).
 *
 * @param {number} ingreso Entero entre 0 y 1439.
 * @param {number} salida Entero entre 0 y 1439.
 * @returns {{ inicio: number, fin: number }}
 * @throws {RangeError} Si ingreso o salida no son enteros entre 0 y 1439.
 */
export function intervaloDePar(ingreso, salida) {
  exigirMinutoDelDia(ingreso, "ingreso");
  exigirMinutoDelDia(salida, "salida");
  if (salida >= ingreso) {
    return { inicio: ingreso, fin: salida };
  }
  return { inicio: ingreso, fin: salida + MINUTOS_DIA };
}

/**
 * Minutos de intersección entre dos intervalos { inicio, fin }.
 * Compartir solo el borde no cuenta: el resultado es 0.
 *
 * @param {{ inicio: number, fin: number }} a
 * @param {{ inicio: number, fin: number }} b
 * @returns {number} Entero mayor o igual que 0.
 */
export function solapamiento(a, b) {
  const inicio = a.inicio > b.inicio ? a.inicio : b.inicio;
  const fin = a.fin < b.fin ? a.fin : b.fin;
  if (fin <= inicio) {
    return 0;
  }
  return fin - inicio;
}

/**
 * Suma el solapamiento de cada intervalo con la ventana.
 * Un arreglo vacío suma 0. No une intervalos que se superpongan entre sí:
 * ese caso no está definido en la especificación y cada uno se cuenta aparte.
 *
 * @param {Array<{ inicio: number, fin: number }>} intervalos
 * @param {{ inicio: number, fin: number }} ventana
 * @returns {number} Entero mayor o igual que 0.
 */
export function solapamientoTotal(intervalos, ventana) {
  let total = 0;
  for (let i = 0; i < intervalos.length; i += 1) {
    total += solapamiento(intervalos[i], ventana);
  }
  return total;
}
