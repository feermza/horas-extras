/**
 * Generación del libro Excel mensual para revisión (sección 11).
 * Sin DOM ni descargas: devuelve un buffer.
 */

import ExcelJS from "exceljs";
import { configuracionVigente } from "../motor/calculoDia.js";
import { diaDeLaSemana, TIPOS_DIA } from "../motor/clasificacion.js";
import { parsearDuracion, parsearHora } from "../motor/tiempo.js";

const FMT_HORA = "[h]:mm";
const FMT_FECHA = "dd/mm/yyyy";
const FMT_ENTERO = "0";
const FMT_MONTO = '"$"#,##0';
const FMT_MONTO_DEC = '"$"#,##0.00';
const FMT_MONTO_DIFF = '"$"#,##0;-"$"#,##0';

const FILA_ENCABEZADO = 9;
const FILA_PRIMERA = 10;
const COL_FACTOR = 16; // P
const COL_ULTIMA_VISIBLE = 15; // O

const CLASE_COMPLETA = "COMPLETA";
const CLASE_ESPECIAL = "ESPECIAL_LAO_RECESO";

const AZUL_PIZARRA = "FF1F3A5F";
const TEXTO = "FF262626";
const TEXTO_SEC = "FF6B7480";
const TEXTO_APAGADO = "FFA3AAB4";
const LINEA_FILA = "FFE3E7EC";
const CIERRE_SEMANA = "FFAEB9C6";
const LINEA_TARJETA = "FFD5DBE3";
const LINEA_IMPORTE = "FFC9D1DB";
const RELLENO_ENCABEZADO = "FFEEF2F6";
const FONDO_TARJETA = "FFFAFBFC";
const BORDE_EDITABLE = "FF9FB0C3";
const AMBAR = "FFFFEFB8";
const AMBAR_BORDE = "FFE2C766";
const VERDE = "FFA9D08E";
const ROJO = "FFF8D7D7";
const RELLENO_TOTALES = "FFF6F8FA";
const VERDE_TEXTO = "FF2E7D32";
const ROJO_TEXTO = "FFB91C1C";

const FUENTE = "Calibri";

const DIAS_ES = Object.freeze([
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
]);

const MESES_ES = Object.freeze([
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
]);

/** Encabezados visibles A–O; P (Factor) oculta. */
const ENCABEZADOS = Object.freeze([
  "Fecha",
  "Día",
  "Ingreso 1",
  "Salida 1",
  "Ingreso 2",
  "Salida 2",
  "Ingreso 3",
  "Salida 3",
  "Hs. jornada",
  "Hs. autorizadas",
  "Hs. extra realizadas",
  "Hs. finales",
  "Semana\nautorizadas",
  "Semana\nfinales",
  "Observaciones",
]);

const ANCHOS_AGENTE = Object.freeze([
  12, 11, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 11, 12, 12, 11, 12, 12, 30, 8,
]);

const ANCHOS_RESUMEN = Object.freeze([11, 36, 14, 14, 12, 16]);

const ROTULOS_LIQUIDACION = Object.freeze([
  [3, "Hs. extra autorizadas"],
  [4, "Hs. extra realizadas"],
  [5, "Hs. finales (días comunes)"],
  [6, "Hs. finales (feriados, cuentan x2)"],
  [7, "Total hs. a liquidar"],
]);

const AVISOS_AMBAR = new Set([
  "EXCEDENTE_SOBRE_TOPE",
  "SIN_AUTORIZACION_DIA",
  "BAJO_UMBRAL",
  "TRABAJO_DOMINGO_SIN_AUTORIZACION",
  "TRABAJO_SABADO_NO_HABILITADO",
]);

/**
 * @param {number} minutos
 * @returns {number}
 */
function fraccionDia(minutos) {
  return minutos / 1440;
}

/**
 * @param {string} fecha
 * @returns {Date}
 */
function fechaUtc(fecha) {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/**
 * @param {string} nombre
 * @returns {string}
 */
function baseNombreHoja(nombre) {
  const texto = typeof nombre === "string" ? nombre.trim() : "";
  const coma = texto.indexOf(",");
  let base;
  if (coma === -1) {
    base = texto;
  } else {
    const apellido = texto.slice(0, coma).trim();
    const resto = texto.slice(coma + 1).trim();
    const inicial = resto.length > 0 ? resto[0].toUpperCase() : "";
    base = inicial === "" ? apellido : `${apellido}, ${inicial}`;
  }
  return base.replace(/[:\\/?*[\]]/g, "").slice(0, 31);
}

/**
 * @param {string} nombreAgente
 * @param {Set<string>} usados
 * @returns {string}
 */
function nombreHojaUnico(nombreAgente, usados) {
  const base = baseNombreHoja(nombreAgente) || "Agente";
  let candidato = base.slice(0, 31);
  let n = 2;
  while (usados.has(candidato)) {
    const sufijo = ` ${n}`;
    candidato = `${base.slice(0, 31 - sufijo.length)}${sufijo}`;
    n += 1;
  }
  usados.add(candidato);
  return candidato;
}

/**
 * @param {string} nombre
 * @returns {string}
 */
function refHoja(nombre) {
  return `'${String(nombre).replace(/'/g, "''")}'`;
}

/**
 * @param {unknown} valor
 * @returns {number|null}
 */
function minutosDeMarca(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }
  if (Number.isSafeInteger(valor) && valor >= 0 && valor <= 1439) {
    return valor;
  }
  return parsearHora(valor);
}

/**
 * @param {import("exceljs").Cell} celda
 * @param {number|null|undefined} minutos
 */
function escribirHora(celda, minutos) {
  if (minutos === null || minutos === undefined) {
    celda.value = null;
    return;
  }
  celda.value = fraccionDia(minutos);
  celda.numFmt = FMT_HORA;
}

/**
 * @param {import("exceljs").Cell} celda
 * @param {string} formula
 * @param {number|string|null} result
 * @param {string} [numFmt]
 */
function escribirFormula(celda, formula, result, numFmt) {
  celda.value = { formula, result };
  if (numFmt !== undefined) {
    celda.numFmt = numFmt;
  }
}

/**
 * @param {import("exceljs").Cell} celda
 * @param {boolean} locked
 */
function setLocked(celda, locked) {
  celda.protection = { locked, hidden: false };
}

/**
 * @param {string} argb
 * @returns {{ type: "pattern", pattern: "solid", fgColor: { argb: string } }}
 */
function relleno(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/**
 * @param {string} argb
 * @returns {{ type: "pattern", pattern: "solid", bgColor: { argb: string } }}
 */
function rellenoCondicional(argb) {
  return { type: "pattern", pattern: "solid", bgColor: { argb } };
}

/**
 * @param {string} argb
 * @param {"thin"|"medium"} [estilo]
 */
function bordeColor(argb, estilo = "thin") {
  const lado = { style: estilo, color: { argb } };
  return { top: lado, left: lado, bottom: lado, right: lado };
}

/**
 * @param {unknown} dni
 * @returns {string}
 */
function formatearDni(dni) {
  const digitos = String(dni ?? "").replace(/\D/g, "");
  if (digitos === "") {
    return "";
  }
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * @param {unknown} valorHora
 * @returns {string}
 */
function formatoValorHora(valorHora) {
  const n = Number(valorHora);
  if (!Number.isFinite(n)) {
    return FMT_MONTO;
  }
  return Number.isInteger(n) ? FMT_MONTO : FMT_MONTO_DEC;
}

/**
 * @param {import("exceljs").Cell} celda
 * @param {Partial<import("exceljs").Font>} parcial
 */
function fuente(celda, parcial) {
  celda.font = {
    name: FUENTE,
    size: 10,
    color: { argb: TEXTO },
    ...(celda.font ?? {}),
    ...parcial,
    color: parcial.color ?? celda.font?.color ?? { argb: TEXTO },
  };
}

/**
 * @param {import("exceljs").Cell} celda
 * @param {import("exceljs").Alignment} parcial
 */
function alinear(celda, parcial) {
  celda.alignment = {
    horizontal: "center",
    vertical: "middle",
    ...(celda.alignment ?? {}),
    ...parcial,
  };
}

/**
 * @param {import("exceljs").Worksheet} hoja
 * @param {string} rango
 * @param {string} argb
 * @param {"thin"|"medium"} [estilo]
 */
function bordeExteriorRango(hoja, rango, argb, estilo = "thin") {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rango);
  if (match === null) {
    return;
  }
  const colDesde = hoja.getColumn(match[1]).number;
  const filaDesde = Number(match[2]);
  const colHasta = hoja.getColumn(match[3]).number;
  const filaHasta = Number(match[4]);
  for (let fila = filaDesde; fila <= filaHasta; fila += 1) {
    for (let col = colDesde; col <= colHasta; col += 1) {
      const celda = hoja.getCell(fila, col);
      const actual = celda.border ?? {};
      celda.border = {
        top: fila === filaDesde ? { style: estilo, color: { argb } } : actual.top,
        bottom: fila === filaHasta ? { style: estilo, color: { argb } } : actual.bottom,
        left: col === colDesde ? { style: estilo, color: { argb } } : actual.left,
        right: col === colHasta ? { style: estilo, color: { argb } } : actual.right,
      };
    }
  }
}

/**
 * @param {object[]} diasArchivo
 * @returns {Map<string, { marcaciones: object[], observacion: string }>}
 */
function indexarArchivo(diasArchivo) {
  /** @type {Map<string, { marcaciones: object[], observacion: string }>} */
  const mapa = new Map();
  for (const fila of diasArchivo ?? []) {
    if (fila && typeof fila.fecha === "string") {
      mapa.set(fila.fecha, {
        marcaciones: Array.isArray(fila.marcaciones) ? fila.marcaciones : [],
        observacion: typeof fila.observacion === "string" ? fila.observacion : "",
      });
    }
  }
  return mapa;
}

/**
 * @param {string} fecha
 * @returns {number}
 */
function filaInicioSemana(fecha) {
  const dow = diaDeLaSemana(fecha);
  const diasDesdeLunes = dow === 0 ? 6 : dow - 1;
  const diaMes = Number(fecha.slice(8, 10));
  const inicioDia = Math.max(1, diaMes - diasDesdeLunes);
  return FILA_ENCABEZADO + inicioDia;
}

/**
 * @param {string} fecha
 * @param {boolean} esUltimo
 * @returns {boolean}
 */
function mostrarSumaSemanal(fecha, esUltimo) {
  const dow = diaDeLaSemana(fecha);
  if (dow === 6) {
    return true;
  }
  return esUltimo && dow >= 1 && dow <= 5;
}

/**
 * @param {number[]} valores
 * @param {number} desdeIndice
 * @param {number} hastaIndice
 * @returns {number}
 */
function sumarRango(valores, desdeIndice, hastaIndice) {
  let total = 0;
  for (let i = desdeIndice; i <= hastaIndice; i += 1) {
    total += valores[i] ?? 0;
  }
  return total;
}

/**
 * @param {object[]} dias
 * @param {number} desdeIndice
 * @param {number} hastaIndice
 * @returns {number}
 */
function sumarMinutosComputadas(dias, desdeIndice, hastaIndice) {
  let total = 0;
  for (let i = desdeIndice; i <= hastaIndice; i += 1) {
    total += dias[i].Hs_Computada_Sistema;
  }
  return total;
}

/**
 * @param {object|null} cfg
 * @returns {boolean}
 */
function sabadoHabilitado(cfg) {
  if (cfg === null || cfg === undefined) {
    return false;
  }
  const ini = cfg.sabado_inicio;
  const fin = cfg.sabado_fin;
  return ini !== null && ini !== undefined && ini !== ""
    && fin !== null && fin !== undefined && fin !== "";
}

/**
 * @param {object|null|undefined} novedad
 * @returns {boolean}
 */
function esLaoOReceso(novedad) {
  return novedad !== null && novedad !== undefined
    && novedad.tipo === "JUSTIFICACION"
    && novedad.clase === CLASE_ESPECIAL;
}

/**
 * @param {Array<{ ingreso?: unknown, salida?: unknown }>} marcaciones
 * @returns {boolean}
 */
function tieneMarcacionCargada(marcaciones) {
  for (const par of marcaciones ?? []) {
    if (minutosDeMarca(par.ingreso) !== null || minutosDeMarca(par.salida) !== null) {
      return true;
    }
  }
  return false;
}

/**
 * Jornada mostrada en I (solo presentación; misma regla que la ex K).
 *
 * @param {object} dia
 * @param {object|null} cfg
 * @returns {number|null}
 */
function minutosJornadaMostrada(dia, cfg) {
  if (esLaoOReceso(dia.novedad)) {
    return cfg === null ? null : parsearDuracion(cfg.duracion_jornada);
  }
  if (dia.novedad !== null && dia.novedad !== undefined
    && dia.novedad.tipo === "JUSTIFICACION"
    && dia.novedad.clase === CLASE_COMPLETA) {
    return 0;
  }
  if (
    dia.tipo === TIPOS_DIA.DOMINGO
    || dia.tipo === TIPOS_DIA.FERIADO
    || dia.tipo === TIPOS_DIA.ASUETO
  ) {
    return 0;
  }
  if (dia.tipo === TIPOS_DIA.SABADO && !sabadoHabilitado(cfg)) {
    return 0;
  }
  if (dia.novedad !== null && dia.novedad !== undefined && dia.novedad.tipo === "PERMISO"
    && Number.isSafeInteger(dia.novedad.jornadaExigible)) {
    return dia.novedad.jornadaExigible;
  }
  if (cfg === null || cfg === undefined) {
    return null;
  }
  return parsearDuracion(cfg.duracion_jornada);
}

/**
 * Autorizadas mostradas en J (solo presentación; misma regla que la ex L).
 *
 * @param {object} dia
 * @param {Array<{ ingreso?: unknown, salida?: unknown }>} marcaciones
 * @returns {number}
 */
function minutosAutorizadasMostrada(dia, marcaciones) {
  if (esLaoOReceso(dia.novedad)) {
    return dia.Tope_Aplicable;
  }
  if (dia.tipo === TIPOS_DIA.FERIADO || dia.tipo === TIPOS_DIA.ASUETO) {
    return tieneMarcacionCargada(marcaciones) ? dia.Tope_Aplicable : 0;
  }
  return dia.Tope_Aplicable;
}

/**
 * @param {object} dia
 * @returns {boolean}
 */
function tieneAvisoAmbar(dia) {
  return (dia.avisos ?? []).some((a) => AVISOS_AMBAR.has(a.codigo));
}

/**
 * @param {import("exceljs").Worksheet} hoja
 */
function aplicarAnchosAgente(hoja) {
  for (let i = 0; i < ANCHOS_AGENTE.length; i += 1) {
    hoja.getColumn(i + 1).width = ANCHOS_AGENTE[i];
  }
}

/**
 * @param {import("exceljs").Worksheet} hoja
 * @param {object} entrada
 */
function llenarHojaAgente(hoja, entrada) {
  const { resultado, archivo } = entrada;
  const agente = resultado.agente;
  const periodo = resultado.periodo;
  const dias = resultado.dias;
  const totales = resultado.totales;
  const ultima = FILA_ENCABEZADO + dias.length;
  const mesTexto = MESES_ES[periodo.mes - 1];
  const porFecha = indexarArchivo(archivo.dias);

  /** @type {number[]} */
  const autorizadasMostradas = [];
  for (let i = 0; i < dias.length; i += 1) {
    const dia = dias[i];
    const archivoDia = porFecha.get(dia.fecha) ?? { marcaciones: [], observacion: "" };
    autorizadasMostradas.push(minutosAutorizadasMostrada(dia, archivoDia.marcaciones));
  }
  const totalAutorizadasMostradas = sumarRango(autorizadasMostradas, 0, dias.length - 1);

  aplicarAnchosAgente(hoja);
  hoja.getColumn(COL_FACTOR).hidden = true;
  hoja.properties.defaultFont = { name: FUENTE, size: 10, color: { argb: TEXTO } };

  // —— Título (centrado sobre A:O sin combinar) ——
  for (let col = 1; col <= COL_ULTIMA_VISIBLE; col += 1) {
    const c = hoja.getCell(1, col);
    if (col === 1) {
      c.value = `INFORME DE HORAS EXTRAS - ${mesTexto}/${periodo.anio}`;
      fuente(c, { size: 15, bold: true, color: { argb: AZUL_PIZARRA } });
    }
    alinear(c, { horizontal: "centerContinuous", vertical: "middle" });
    c.border = {
      ...(c.border ?? {}),
      bottom: { style: "medium", color: { argb: AZUL_PIZARRA } },
    };
  }
  hoja.getRow(2).height = 6;

  // —— Tarjeta ficha A3:F7 ——
  for (let fila = 3; fila <= 7; fila += 1) {
    hoja.getRow(fila).height = 21;
    for (let col = 1; col <= 6; col += 1) {
      hoja.getCell(fila, col).fill = relleno(FONDO_TARJETA);
    }
  }
  const a3 = hoja.getCell("A3");
  a3.value = "Agente";
  fuente(a3, { size: 9, color: { argb: TEXTO_SEC } });
  alinear(a3, { horizontal: "left" });
  const a4 = hoja.getCell("A4");
  a4.value = agente.nombre;
  fuente(a4, { size: 13, bold: true });
  alinear(a4, { horizontal: "left" });
  const a5 = hoja.getCell("A5");
  a5.value = "Legajo";
  fuente(a5, { size: 9, color: { argb: TEXTO_SEC } });
  alinear(a5, { horizontal: "left" });
  const b5 = hoja.getCell("B5");
  b5.value = Number(agente.legajo);
  b5.numFmt = FMT_ENTERO;
  fuente(b5, { size: 10 });
  alinear(b5, { horizontal: "left" });
  const a6 = hoja.getCell("A6");
  a6.value = "DNI";
  fuente(a6, { size: 9, color: { argb: TEXTO_SEC } });
  alinear(a6, { horizontal: "left" });
  const b6 = hoja.getCell("B6");
  b6.value = formatearDni(agente.dni);
  fuente(b6, { size: 10 });
  alinear(b6, { horizontal: "left" });
  const a7 = hoja.getCell("A7");
  a7.value = "Valor hora";
  fuente(a7, { size: 9, color: { argb: TEXTO_SEC } });
  alinear(a7, { horizontal: "left" });
  const b7 = hoja.getCell("B7");
  b7.value = totales.valorHoraBase;
  b7.numFmt = formatoValorHora(totales.valorHoraBase);
  fuente(b7, { size: 10 });
  alinear(b7, { horizontal: "left" });
  bordeExteriorRango(hoja, "A3:F7", LINEA_TARJETA);

  // —— Tarjeta liquidación H3:L7 ——
  for (let fila = 3; fila <= 7; fila += 1) {
    for (let col = 8; col <= 12; col += 1) {
      hoja.getCell(fila, col).fill = relleno(FONDO_TARJETA);
    }
  }
  for (const [fila, texto] of ROTULOS_LIQUIDACION) {
    const rotulo = hoja.getCell(fila, 8);
    rotulo.value = texto;
    fuente(rotulo, {
      size: fila === 7 ? 10 : 9,
      bold: fila === 7,
      color: { argb: TEXTO_SEC },
    });
    alinear(rotulo, { horizontal: "left" });
  }
  escribirFormula(
    hoja.getCell("L3"),
    `SUM(J${FILA_PRIMERA}:J${ultima})`,
    fraccionDia(totalAutorizadasMostradas),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("L4"),
    `SUM(K${FILA_PRIMERA}:K${ultima})`,
    fraccionDia(totales.realizadas),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("L5"),
    `SUMIF(P${FILA_PRIMERA}:P${ultima},1,L${FILA_PRIMERA}:L${ultima})`,
    fraccionDia(totales.finalesSimples),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("L6"),
    `SUMIF(P${FILA_PRIMERA}:P${ultima},2,L${FILA_PRIMERA}:L${ultima})`,
    fraccionDia(totales.finalesDobles),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("L7"),
    "L5+2*L6",
    fraccionDia(totales.finalesEquivalentes),
    FMT_HORA,
  );
  for (let fila = 3; fila <= 7; fila += 1) {
    const celda = hoja.getCell(fila, 12);
    fuente(celda, { size: 10, bold: fila === 7 });
    alinear(celda, { horizontal: "right" });
  }
  for (let col = 8; col <= 12; col += 1) {
    const c = hoja.getCell(7, col);
    c.border = {
      ...(c.border ?? {}),
      top: { style: "thin", color: { argb: LINEA_TARJETA } },
    };
  }
  bordeExteriorRango(hoja, "H3:L7", LINEA_TARJETA);

  // —— Tarjeta importe M3:O7 ——
  for (let fila = 3; fila <= 7; fila += 1) {
    for (let col = 13; col <= 15; col += 1) {
      hoja.getCell(fila, col).fill = relleno(RELLENO_ENCABEZADO);
    }
  }
  for (let col = 13; col <= 15; col += 1) {
    const c = hoja.getCell(4, col);
    if (col === 13) {
      c.value = "IMPORTE A LIQUIDAR";
    }
    fuente(c, { size: 9, color: { argb: TEXTO_SEC } });
    alinear(c, { horizontal: "centerContinuous", vertical: "middle" });
  }
  for (let col = 13; col <= 15; col += 1) {
    const c = hoja.getCell(5, col);
    if (col === 13) {
      escribirFormula(
        c,
        "ROUNDUP(ROUND(L7*1440,0)*B7/60,0)",
        totales.importe,
        FMT_MONTO,
      );
    }
    fuente(c, { size: 16, bold: true, color: { argb: AZUL_PIZARRA } });
    alinear(c, { horizontal: "centerContinuous", vertical: "middle" });
  }
  bordeExteriorRango(hoja, "M3:O7", LINEA_IMPORTE);

  hoja.getRow(8).height = 6;

  // —— Encabezado tabla fila 9 ——
  const filaEnc = hoja.getRow(FILA_ENCABEZADO);
  filaEnc.height = 32;
  for (let c = 0; c < ENCABEZADOS.length; c += 1) {
    const col = c + 1;
    const celda = hoja.getCell(FILA_ENCABEZADO, col);
    celda.value = ENCABEZADOS[c];
    celda.fill = relleno(RELLENO_ENCABEZADO);
    fuente(celda, { size: 10, bold: true, color: { argb: AZUL_PIZARRA } });
    alinear(celda, {
      wrapText: true,
      horizontal: col === 15 ? "left" : "center",
      vertical: "middle",
      indent: col === 15 ? 1 : 0,
    });
    celda.border = {
      bottom: { style: "medium", color: { argb: AZUL_PIZARRA } },
    };
    if (col === 13) {
      celda.border = {
        ...celda.border,
        left: { style: "thin", color: { argb: LINEA_IMPORTE } },
      };
    }
  }

  // —— Filas de datos ——
  for (let i = 0; i < dias.length; i += 1) {
    const dia = dias[i];
    const fila = FILA_PRIMERA + i;
    const archivoDia = porFecha.get(dia.fecha) ?? { marcaciones: [], observacion: "" };
    const marcaciones = archivoDia.marcaciones;
    let cfg = null;
    try {
      cfg = configuracionVigente(agente.configuraciones, dia.fecha);
    } catch {
      cfg = null;
    }
    const esUltimo = i === dias.length - 1;
    const computadas = dia.Hs_Computada_Sistema;
    const minutosJ = autorizadasMostradas[i];
    const esSabado = diaDeLaSemana(dia.fecha) === 6;
    const bloqueante = dia.bloqueante !== null && dia.bloqueante !== undefined;
    const editable = dia.editable === true;
    const ambar = editable && tieneAvisoAmbar(dia);
    const apagado = !tieneMarcacionCargada(marcaciones) && dia.Hs_Extra_Realizada === 0;
    const colorTexto = apagado ? TEXTO_APAGADO : TEXTO;
    const bordeInferior = {
      style: esSabado ? "medium" : "thin",
      color: { argb: esSabado ? CIERRE_SEMANA : LINEA_FILA },
    };

    const celdaFecha = hoja.getCell(fila, 1);
    celdaFecha.value = fechaUtc(dia.fecha);
    celdaFecha.numFmt = FMT_FECHA;
    hoja.getCell(fila, 2).value = DIAS_ES[diaDeLaSemana(dia.fecha)];

    for (let p = 0; p < 3; p += 1) {
      const par = marcaciones[p] ?? {};
      escribirHora(hoja.getCell(fila, 3 + p * 2), minutosDeMarca(par.ingreso));
      escribirHora(hoja.getCell(fila, 4 + p * 2), minutosDeMarca(par.salida));
    }

    escribirHora(hoja.getCell(fila, 9), minutosJornadaMostrada(dia, cfg));
    escribirHora(hoja.getCell(fila, 10), minutosJ);
    escribirHora(hoja.getCell(fila, 11), dia.Hs_Extra_Realizada);

    const celdaL = hoja.getCell(fila, 12);
    escribirHora(celdaL, computadas);

    hoja.getCell(fila, 15).value = archivoDia.observacion;

    if (mostrarSumaSemanal(dia.fecha, esUltimo)) {
      const inicio = filaInicioSemana(dia.fecha);
      const desdeIndice = inicio - FILA_PRIMERA;
      escribirFormula(
        hoja.getCell(fila, 13),
        `SUM(J${inicio}:J${fila})`,
        fraccionDia(sumarRango(autorizadasMostradas, desdeIndice, i)),
        FMT_HORA,
      );
      escribirFormula(
        hoja.getCell(fila, 14),
        `SUM(L${inicio}:L${fila})`,
        fraccionDia(sumarMinutosComputadas(dias, desdeIndice, i)),
        FMT_HORA,
      );
    }

    hoja.getCell(fila, COL_FACTOR).value = dia.factor;

    for (let col = 1; col <= COL_FACTOR; col += 1) {
      const celda = hoja.getCell(fila, col);
      fuente(celda, {
        size: 10,
        color: { argb: col <= 12 || col === 15 ? colorTexto : TEXTO_SEC },
        italic: col === 13 || col === 14,
      });
      alinear(celda, {
        horizontal: col === 15 ? "left" : "center",
        vertical: "middle",
        wrapText: col === 15,
        indent: col === 15 ? 1 : 0,
      });
      if (col <= COL_ULTIMA_VISIBLE) {
        celda.border = {
          ...(celda.border ?? {}),
          bottom: bordeInferior,
        };
      }
      if (col === 13) {
        celda.border = {
          ...(celda.border ?? {}),
          left: { style: "thin", color: { argb: LINEA_IMPORTE } },
          bottom: bordeInferior,
        };
      }

      if (bloqueante && col <= COL_ULTIMA_VISIBLE) {
        celda.fill = relleno(ROJO);
      }

      if (col === 12) {
        setLocked(celda, !editable);
        if (editable) {
          celda.dataValidation = {
            type: "decimal",
            operator: "between",
            allowBlank: false,
            showErrorMessage: true,
            errorTitle: "Valor no permitido",
            error: "Las horas finales deben estar entre 0 y las horas extra realizadas.",
            formulae: ["0", `K${fila}`],
          };
          if (ambar) {
            celda.fill = relleno(AMBAR);
            celda.border = {
              ...bordeColor(AMBAR_BORDE),
              bottom: esSabado
                ? { style: "medium", color: { argb: CIERRE_SEMANA } }
                : { style: "thin", color: { argb: AMBAR_BORDE } },
            };
          } else {
            celda.fill = relleno("FFFFFFFF");
            celda.border = {
              ...bordeColor(BORDE_EDITABLE),
              bottom: esSabado
                ? { style: "medium", color: { argb: CIERRE_SEMANA } }
                : { style: "thin", color: { argb: BORDE_EDITABLE } },
            };
          }
          hoja.addConditionalFormatting({
            ref: `L${fila}`,
            rules: [
              {
                type: "expression",
                priority: 1,
                formulae: [`ROUND($L${fila}*1440,0)<>${computadas}`],
                style: { fill: rellenoCondicional(VERDE) },
              },
            ],
          });
        }
      } else {
        setLocked(celda, true);
      }
    }
  }

  hoja.views = [{
    state: "frozen",
    ySplit: FILA_ENCABEZADO,
    activeCell: "A1",
    showGridLines: false,
  }];
  hoja.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:O${ultima}`,
    printTitlesRow: "9:9",
    showGridLines: false,
  };
  hoja.headerFooter = {
    oddHeader: `&L${agente.nombre} - Legajo ${agente.legajo}`,
    evenHeader: `&L${agente.nombre} - Legajo ${agente.legajo}`,
    oddFooter: "&CPágina &P de &N",
    evenFooter: "&CPágina &P de &N",
  };

  for (let fila = 1; fila <= FILA_ENCABEZADO; fila += 1) {
    for (let col = 1; col <= COL_FACTOR; col += 1) {
      setLocked(hoja.getCell(fila, col), true);
    }
  }
}

/**
 * @param {import("exceljs").Worksheet} hoja
 * @param {Array<{ resultado: object, nombreHoja: string }>} agentesOrdenados
 * @param {{ nombre_libro?: string, horas_maximas?: string|null }} catalogo
 */
function llenarResumen(hoja, agentesOrdenados, catalogo) {
  if (agentesOrdenados.length === 0) {
    return;
  }
  for (let i = 0; i < ANCHOS_RESUMEN.length; i += 1) {
    hoja.getColumn(i + 1).width = ANCHOS_RESUMEN[i];
  }
  hoja.properties.defaultFont = { name: FUENTE, size: 10, color: { argb: TEXTO } };

  const periodo = agentesOrdenados[0].resultado.periodo;
  const mesTexto = MESES_ES[periodo.mes - 1];
  hoja.getRow(1).height = 28;
  for (let col = 1; col <= 6; col += 1) {
    const c = hoja.getCell(1, col);
    if (col === 1) {
      c.value = `INFORME MENSUAL DE TOTAL DE HORAS EXTRAS - ${mesTexto}/${periodo.anio}`;
      fuente(c, { size: 15, bold: true, color: { argb: AZUL_PIZARRA } });
    }
    alinear(c, { horizontal: "centerContinuous", vertical: "middle" });
    c.border = {
      bottom: { style: "medium", color: { argb: AZUL_PIZARRA } },
    };
  }

  const encabezados = [
    "Legajo Nº",
    "Apellido y Nombres",
    "DNI",
    "Monto/Hora",
    "Horas",
    "Monto Total",
  ];
  hoja.getRow(2).height = 30;
  for (let c = 0; c < encabezados.length; c += 1) {
    const col = c + 1;
    const celda = hoja.getCell(2, col);
    celda.value = encabezados[c];
    celda.fill = relleno(RELLENO_ENCABEZADO);
    fuente(celda, { size: 10, bold: true, color: { argb: AZUL_PIZARRA } });
    alinear(celda, {
      horizontal: col === 2 ? "left" : "center",
      vertical: "middle",
      wrapText: true,
    });
    celda.border = { bottom: { style: "medium", color: { argb: AZUL_PIZARRA } } };
  }

  for (let i = 0; i < agentesOrdenados.length; i += 1) {
    const { resultado, nombreHoja } = agentesOrdenados[i];
    const fila = 3 + i;
    const agente = resultado.agente;
    const totales = resultado.totales;
    const celdaLegajo = hoja.getCell(fila, 1);
    celdaLegajo.value = Number(agente.legajo);
    celdaLegajo.numFmt = FMT_ENTERO;
    hoja.getCell(fila, 2).value = agente.nombre;
    hoja.getCell(fila, 3).value = formatearDni(agente.dni);
    const celdaMontoHora = hoja.getCell(fila, 4);
    celdaMontoHora.value = totales.valorHoraBase;
    celdaMontoHora.numFmt = formatoValorHora(totales.valorHoraBase);
    escribirFormula(
      hoja.getCell(fila, 5),
      `${refHoja(nombreHoja)}!$L$7`,
      fraccionDia(totales.finalesEquivalentes),
      FMT_HORA,
    );
    escribirFormula(
      hoja.getCell(fila, 6),
      `ROUNDUP(ROUND(E${fila}*1440,0)*D${fila}/60,0)`,
      totales.importe,
      FMT_MONTO,
    );
    for (let col = 1; col <= 6; col += 1) {
      const celda = hoja.getCell(fila, col);
      fuente(celda, { size: 10 });
      alinear(celda, { horizontal: col === 2 ? "left" : "center" });
      celda.border = { bottom: { style: "thin", color: { argb: LINEA_FILA } } };
      setLocked(celda, true);
    }
  }

  const primera = 3;
  const ultima = 2 + agentesOrdenados.length;
  const filaTotales = ultima + 1;
  const celdaTotales = hoja.getCell(filaTotales, 2);
  celdaTotales.value = "Totales";
  let sumaE = 0;
  let sumaF = 0;
  for (const item of agentesOrdenados) {
    sumaE += item.resultado.totales.finalesEquivalentes;
    sumaF += item.resultado.totales.importe ?? 0;
  }
  escribirFormula(
    hoja.getCell(filaTotales, 5),
    `SUM(E${primera}:E${ultima})`,
    fraccionDia(sumaE),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell(filaTotales, 6),
    `SUM(F${primera}:F${ultima})`,
    sumaF,
    FMT_MONTO,
  );
  for (let col = 1; col <= 6; col += 1) {
    const celda = hoja.getCell(filaTotales, col);
    celda.fill = relleno(RELLENO_TOTALES);
    fuente(celda, { size: 10, bold: true });
    alinear(celda, { horizontal: col === 2 ? "left" : "center" });
    celda.border = {
      top: { style: "medium", color: { argb: AZUL_PIZARRA } },
      bottom: { style: "medium", color: { argb: AZUL_PIZARRA } },
    };
    setLocked(celda, true);
  }

  const horasMax = catalogo.horas_maximas;
  if (horasMax !== null && horasMax !== undefined && horasMax !== "") {
    const maxMinutos = parsearDuracion(horasMax);
    if (maxMinutos !== null) {
      const valorHora = agentesOrdenados[0].resultado.totales.valorHoraBase ?? 0;
      const montoMax = Math.ceil((maxMinutos * Number(valorHora)) / 60);
      const filaSub = filaTotales + 2;
      const filaA = filaTotales + 3;
      const filaB = filaTotales + 4;
      const filaDif = filaTotales + 5;

      const sub = hoja.getCell(filaSub, 2);
      sub.value = "CONTROL DE HORAS MÁXIMAS";
      fuente(sub, { size: 9, color: { argb: TEXTO_SEC } });
      alinear(sub, { horizontal: "left" });

      hoja.getCell(filaA, 2).value = "Cant. máxima de hs. a abonar (A)";
      escribirHora(hoja.getCell(filaA, 3), maxMinutos);
      const dA = hoja.getCell(filaA, 4);
      dA.value = montoMax;
      dA.numFmt = FMT_MONTO;

      hoja.getCell(filaB, 2).value = "Total de horas (B)";
      escribirFormula(
        hoja.getCell(filaB, 3),
        `E${filaTotales}`,
        fraccionDia(sumaE),
        FMT_HORA,
      );
      escribirFormula(
        hoja.getCell(filaB, 4),
        `F${filaTotales}`,
        sumaF,
        FMT_MONTO,
      );

      hoja.getCell(filaDif, 2).value = "Diferencia (A - B)";
      const supera = sumaE > maxMinutos;
      const resultDif = supera
        ? `SE SUPERA EL MÁXIMO POR ${formatearSuperacion(sumaE - maxMinutos)}`
        : fraccionDia(maxMinutos - sumaE);
      escribirFormula(
        hoja.getCell(filaDif, 3),
        `IF(C${filaB}>C${filaA},"SE SUPERA EL MÁXIMO POR "&TEXT(C${filaB}-C${filaA},"[h]:mm"),C${filaA}-C${filaB})`,
        resultDif,
        supera ? undefined : FMT_HORA,
      );
      escribirFormula(
        hoja.getCell(filaDif, 4),
        `D${filaA}-D${filaB}`,
        montoMax - sumaF,
        FMT_MONTO_DIFF,
      );

      for (const filaCtrl of [filaSub, filaA, filaB, filaDif]) {
        for (let col = 2; col <= 4; col += 1) {
          const celda = hoja.getCell(filaCtrl, col);
          if (filaCtrl !== filaSub) {
            fuente(celda, {
              size: 10,
              bold: filaCtrl === filaDif,
              color: { argb: filaCtrl === filaDif ? VERDE_TEXTO : TEXTO },
            });
          }
          alinear(celda, { horizontal: col === 2 ? "left" : "center" });
          setLocked(celda, true);
        }
      }
      bordeExteriorRango(hoja, `B${filaSub}:D${filaDif}`, LINEA_TARJETA);
      hoja.addConditionalFormatting({
        ref: `C${filaDif}:D${filaDif}`,
        rules: [
          {
            type: "expression",
            priority: 1,
            formulae: [`$C$${filaB}>$C$${filaA}`],
            style: { font: { color: { argb: ROJO_TEXTO }, bold: true } },
          },
        ],
      });
    }
  }

  hoja.views = [{ state: "normal", showGridLines: false, activeCell: "A1" }];
  hoja.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    showGridLines: false,
  };

  for (let fila = 1; fila <= 2; fila += 1) {
    for (let col = 1; col <= 6; col += 1) {
      setLocked(hoja.getCell(fila, col), true);
    }
  }
}

/**
 * @param {number} minutos
 * @returns {string}
 */
function formatearSuperacion(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Genera el libro mensual (11.1–11.5).
 *
 * @param {{
 *   meses: Array<{ resultado: object, archivo: object }>,
 *   catalogo: { nombre_libro: string, horas_maximas?: string|null, umbral_minimo?: string },
 * }} entrada
 * @returns {Promise<ArrayBuffer>}
 */
export async function generarLibro({ meses, catalogo }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "horas-extras";

  const ordenados = [...meses].sort(
    (a, b) => Number(a.resultado.agente.legajo) - Number(b.resultado.agente.legajo),
  );

  /** @type {Set<string>} */
  const usados = new Set(["Resumen"]);
  /** @type {Array<{ resultado: object, archivo: object, nombreHoja: string }>} */
  const conNombre = ordenados.map((item) => ({
    ...item,
    nombreHoja: nombreHojaUnico(item.resultado.agente.nombre, usados),
  }));

  const hojaResumen = workbook.addWorksheet("Resumen");
  llenarResumen(hojaResumen, conNombre, catalogo);
  await hojaResumen.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });

  for (const item of conNombre) {
    const hoja = workbook.addWorksheet(item.nombreHoja);
    llenarHojaAgente(hoja, item);
    await hoja.protect("", {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
