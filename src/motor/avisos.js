/**
 * Texto llano de los avisos (sección 10.2).
 * No redacta bloqueantes: la especificación no les da texto.
 */

import { formatearHM } from "./tiempo.js";

/**
 * @param {{ codigo: string, realizada?: number, tope?: number, excedente?: number, novedad?: string|null, texto?: string|null }} aviso
 * @param {number} umbralMinutos Umbral del catálogo, en minutos. Lo usa BAJO_UMBRAL.
 * @returns {string}
 * @throws {RangeError} Si el código no está en la tabla de 10.2.
 */
export function textoAviso(aviso, umbralMinutos) {
  const realizada = () => formatearHM(aviso.realizada);
  const tope = () => formatearHM(aviso.tope);
  const excedente = () => formatearHM(aviso.excedente);
  switch (aviso.codigo) {
    case "EXCEDENTE_SOBRE_TOPE":
      return `Realizó ${realizada()}, autorizadas ${tope()}: ${excedente()} para autorizar`;
    case "SIN_AUTORIZACION_DIA":
      return `Sin horas autorizadas para este tipo de día: ${realizada()} para autorizar`;
    case "BAJO_UMBRAL":
      return `Menos de ${formatearHM(umbralMinutos)}: no se computa`;
    case "TRABAJO_DOMINGO_SIN_AUTORIZACION":
      return `Trabajó en domingo: ${realizada()} para autorizar`;
    case "TRABAJO_SABADO_NO_HABILITADO":
      return `Trabajó en sábado no habilitado: ${realizada()} para autorizar`;
    case "MARCACIONES_EN_DIA_JUSTIFICADO":
      return `Hay marcaciones en un día justificado (${aviso.novedad})`;
    case "MARCACIONES_INCOMPLETAS":
      return "Marcaciones incompletas: horas estimadas";
    case "OBSERVACION_NO_RECONOCIDA":
      return `Observación no reconocida: ${aviso.texto}`;
    default:
      throw new RangeError(`Código de aviso desconocido: ${aviso.codigo}.`);
  }
}
