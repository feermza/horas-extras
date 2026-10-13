/**
 * Generación del libro Excel mensual para revisión (sección 11).
 * Sin DOM ni descargas: devuelve un buffer.
 */

import ExcelJS from "exceljs";
import { configuracionVigente } from "../motor/calculoDia.js";
import { diaDeLaSemana } from "../motor/clasificacion.js";
import { parsearDuracion, parsearHora } from "../motor/tiempo.js";

const FMT_HORA = "[h]:mm";
const FMT_FECHA = "dd/mm/yyyy";
const FILA_ENCABEZADO = 12;
const FILA_PRIMERA = 13;
const COL_FACTOR = 18; // R

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

/** Encabezados visibles A–Q; R (Factor) va oculta sin texto de encabezado. */
const ENCABEZADOS = Object.freeze([
  "Legajo",
  "Nombre",
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
  "Observaciones",
  "Semana: autorizadas",
  "Semana: finales",
]);

/** Anchos fijos de columnas A–R. */
const ANCHOS_AGENTE = Object.freeze([
  10, 28, 12, 11, 10, 10, 10, 10, 10, 10, 11, 12, 12, 11, 36, 12, 12, 8,
]);

const ANCHOS_RESUMEN = Object.freeze([14, 28, 14, 12, 12, 14]);

const COLOR_ROJO = "FFF4B6B6";
const COLOR_NARANJA = "FFF8CBAD";
const COLOR_AMARILLO = "FFFFF2CC";
const COLOR_ALT = "FFF2F2F2";
const COLOR_AZUL_N = "FFDDEBF7";
const COLOR_VERDE_N = "FFA9D08E";

const AVISOS_NARANJA = new Set([
  "TRABAJO_DOMINGO_SIN_AUTORIZACION",
  "TRABAJO_SABADO_NO_HABILITADO",
]);
const AVISOS_AMARILLO = new Set([
  "EXCEDENTE_SOBRE_TOPE",
  "SIN_AUTORIZACION_DIA",
  "BAJO_UMBRAL",
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
 * Relleno de celda (fgColor).
 *
 * @param {string} argb
 * @returns {{ type: "pattern", pattern: "solid", fgColor: { argb: string } }}
 */
function relleno(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/**
 * Relleno para formato condicional (bgColor en ExcelJS).
 *
 * @param {string} argb
 * @returns {{ type: "pattern", pattern: "solid", bgColor: { argb: string } }}
 */
function rellenoCondicional(argb) {
  return { type: "pattern", pattern: "solid", bgColor: { argb } };
}

/**
 * @param {object} dia
 * @param {number} fila
 * @returns {string|null} ARGB o null (blanco)
 */
function colorFila(dia, fila) {
  if (dia.bloqueante !== null && dia.bloqueante !== undefined) {
    return COLOR_ROJO;
  }
  const codigos = (dia.avisos ?? []).map((a) => a.codigo);
  if (codigos.some((c) => AVISOS_NARANJA.has(c))) {
    return COLOR_NARANJA;
  }
  if (codigos.some((c) => AVISOS_AMARILLO.has(c))) {
    return COLOR_AMARILLO;
  }
  return fila % 2 === 0 ? COLOR_ALT : null;
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
 * @param {object[]} dias
 * @param {number} desdeIndice
 * @param {number} hastaIndice
 * @param {"tope"|"final"} cual
 * @returns {number}
 */
function sumarMinutos(dias, desdeIndice, hastaIndice, cual) {
  let total = 0;
  for (let i = desdeIndice; i <= hastaIndice; i += 1) {
    total += cual === "tope" ? dias[i].Tope_Aplicable : dias[i].Hs_Final;
  }
  return total;
}

/**
 * @param {object} novedad
 * @param {object|null} cfg
 * @returns {number|null}
 */
function minutosJornada(novedad, cfg) {
  if (novedad !== null && novedad !== undefined && novedad.tipo === "PERMISO"
    && Number.isSafeInteger(novedad.jornadaExigible)) {
    return novedad.jornadaExigible;
  }
  if (cfg === null || cfg === undefined) {
    return null;
  }
  return parsearDuracion(cfg.duracion_jornada);
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

  aplicarAnchosAgente(hoja);
  hoja.getColumn(COL_FACTOR).hidden = true;

  hoja.getCell("A1").value = `INFORME DE HORAS EXTRAS - ${mesTexto}/${periodo.anio}`;
  hoja.getCell("A2").value = "Agente:";
  hoja.getCell("B2").value = agente.nombre;
  hoja.getCell("D2").value = "Legajo:";
  hoja.getCell("E2").value = agente.legajo;
  hoja.getCell("G2").value = "DNI:";
  hoja.getCell("H2").value = agente.dni;
  hoja.getCell("G3").value = "Valor hora:";
  hoja.getCell("H3").value = totales.valorHoraBase;

  hoja.getCell("A5").value = "Hs. extra realizadas";
  hoja.getCell("A6").value = "Hs. finales simples";
  hoja.getCell("A7").value = "Hs. finales dobles";
  hoja.getCell("A8").value = "Hs. finales equivalentes";
  hoja.getCell("A9").value = "Importe";

  escribirFormula(
    hoja.getCell("C5"),
    `SUM(M${FILA_PRIMERA}:M${ultima})`,
    fraccionDia(totales.realizadas),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("C6"),
    `SUMIF(R${FILA_PRIMERA}:R${ultima},1,N${FILA_PRIMERA}:N${ultima})`,
    fraccionDia(totales.finalesSimples),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("C7"),
    `SUMIF(R${FILA_PRIMERA}:R${ultima},2,N${FILA_PRIMERA}:N${ultima})`,
    fraccionDia(totales.finalesDobles),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("C8"),
    "C6+2*C7",
    fraccionDia(totales.finalesEquivalentes),
    FMT_HORA,
  );
  escribirFormula(
    hoja.getCell("C9"),
    "ROUNDUP(ROUND(C8*1440,0)*H3/60,0)",
    totales.importe,
  );

  const filaEnc = hoja.getRow(FILA_ENCABEZADO);
  filaEnc.height = 36;
  for (let c = 0; c < ENCABEZADOS.length; c += 1) {
    const celda = hoja.getCell(FILA_ENCABEZADO, c + 1);
    celda.value = ENCABEZADOS[c];
    celda.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  }

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
    const color = colorFila(dia, fila);
    const esUltimo = i === dias.length - 1;
    const computadas = dia.Hs_Computada_Sistema;

    hoja.getCell(fila, 1).value = agente.legajo;
    hoja.getCell(fila, 2).value = agente.nombre;
    const celdaFecha = hoja.getCell(fila, 3);
    celdaFecha.value = fechaUtc(dia.fecha);
    celdaFecha.numFmt = FMT_FECHA;
    hoja.getCell(fila, 4).value = DIAS_ES[diaDeLaSemana(dia.fecha)];

    for (let p = 0; p < 3; p += 1) {
      const par = marcaciones[p] ?? {};
      escribirHora(hoja.getCell(fila, 5 + p * 2), minutosDeMarca(par.ingreso));
      escribirHora(hoja.getCell(fila, 6 + p * 2), minutosDeMarca(par.salida));
    }

    escribirHora(hoja.getCell(fila, 11), minutosJornada(dia.novedad, cfg));
    escribirHora(hoja.getCell(fila, 12), dia.Tope_Aplicable);
    escribirHora(hoja.getCell(fila, 13), dia.Hs_Extra_Realizada);

    const celdaN = hoja.getCell(fila, 14);
    escribirHora(celdaN, computadas);

    hoja.getCell(fila, 15).value = archivoDia.observacion;

    if (mostrarSumaSemanal(dia.fecha, esUltimo)) {
      const inicio = filaInicioSemana(dia.fecha);
      const desdeIndice = inicio - FILA_PRIMERA;
      escribirFormula(
        hoja.getCell(fila, 16),
        `SUM(L${inicio}:L${fila})`,
        fraccionDia(sumarMinutos(dias, desdeIndice, i, "tope")),
        FMT_HORA,
      );
      // Q suma N; el valor inicial de N es la computada (constante).
      escribirFormula(
        hoja.getCell(fila, 17),
        `SUM(N${inicio}:N${fila})`,
        fraccionDia(sumarMinutosComputadas(dias, desdeIndice, i)),
        FMT_HORA,
      );
    }

    hoja.getCell(fila, COL_FACTOR).value = dia.factor;

    for (let col = 1; col <= COL_FACTOR; col += 1) {
      const celda = hoja.getCell(fila, col);
      if (col === 14) {
        setLocked(celda, !dia.editable);
        if (dia.editable) {
          celda.dataValidation = {
            type: "decimal",
            operator: "between",
            allowBlank: false,
            showErrorMessage: true,
            errorTitle: "Valor no permitido",
            error: "Las horas finales deben estar entre 0 y las horas extra realizadas.",
            formulae: ["0", `M${fila}`],
          };
          hoja.addConditionalFormatting({
            ref: `N${fila}`,
            rules: [
              {
                type: "expression",
                formulae: [`ROUND($N${fila}*1440,0)<>${computadas}`],
                style: { fill: rellenoCondicional(COLOR_VERDE_N) },
              },
            ],
          });
        }
      } else {
        setLocked(celda, true);
        if (color !== null) {
          celda.fill = relleno(color);
        }
      }
    }
    celdaN.fill = relleno(COLOR_AZUL_N);
  }

  hoja.views = [{ state: "frozen", ySplit: FILA_ENCABEZADO, activeCell: "A1", showGridLines: true }];
  hoja.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    printArea: `A1:Q${ultima}`,
  };

  for (const fila of [1, 2, 3, 5, 6, 7, 8, 9, FILA_ENCABEZADO]) {
    for (let col = 1; col <= COL_FACTOR; col += 1) {
      setLocked(hoja.getCell(fila, col), true);
    }
  }
}

/**
 * Suma de computadas para el result de Q (N arranca igual a la computada).
 *
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

  const periodo = agentesOrdenados[0].resultado.periodo;
  const mesTexto = MESES_ES[periodo.mes - 1];
  hoja.getCell("C1").value = `${mesTexto}/${periodo.anio}`;

  const encabezados = [
    "Legajo Nº",
    "Apellido y Nombres",
    "DNI",
    "Monto/Hora",
    "Horas",
    "Monto Total",
  ];
  for (let c = 0; c < encabezados.length; c += 1) {
    hoja.getCell(2, c + 1).value = encabezados[c];
  }

  for (let i = 0; i < agentesOrdenados.length; i += 1) {
    const { resultado, nombreHoja } = agentesOrdenados[i];
    const fila = 3 + i;
    const agente = resultado.agente;
    const totales = resultado.totales;
    hoja.getCell(fila, 1).value = agente.legajo;
    hoja.getCell(fila, 2).value = agente.nombre;
    hoja.getCell(fila, 3).value = agente.dni;
    hoja.getCell(fila, 4).value = totales.valorHoraBase;
    escribirFormula(
      hoja.getCell(fila, 5),
      `${refHoja(nombreHoja)}!$C$8`,
      fraccionDia(totales.finalesEquivalentes),
      FMT_HORA,
    );
    escribirFormula(
      hoja.getCell(fila, 6),
      `ROUNDUP(ROUND(E${fila}*1440,0)*D${fila}/60,0)`,
      totales.importe,
    );
  }

  const primera = 3;
  const ultima = 2 + agentesOrdenados.length;
  const filaTotales = ultima + 1;
  hoja.getCell(filaTotales, 1).value = "Totales";
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
  );

  const horasMax = catalogo.horas_maximas;
  if (horasMax !== null && horasMax !== undefined && horasMax !== "") {
    const maxMinutos = parsearDuracion(horasMax);
    if (maxMinutos !== null) {
      const valorHora = agentesOrdenados[0].resultado.totales.valorHoraBase ?? 0;
      const montoMax = Math.ceil((maxMinutos * Number(valorHora)) / 60);
      const filaA = filaTotales + 2;
      const filaB = filaTotales + 3;
      const filaDif = filaTotales + 4;

      hoja.mergeCells(`A${filaA}:B${filaA}`);
      hoja.getCell(filaA, 1).value = "Cant. Máxima de Hs. a abonar (A)";
      escribirHora(hoja.getCell(filaA, 3), maxMinutos);
      hoja.getCell(filaA, 4).value = montoMax;

      hoja.mergeCells(`A${filaB}:B${filaB}`);
      hoja.getCell(filaB, 1).value = "Total de horas (B)";
      escribirFormula(
        hoja.getCell(filaB, 3),
        `E${filaTotales}`,
        fraccionDia(sumaE),
        FMT_HORA,
      );

      hoja.mergeCells(`A${filaDif}:B${filaDif}`);
      hoja.getCell(filaDif, 1).value = "Diferencia (A - B)";
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
      if (supera) {
        hoja.getCell(filaDif, 3).font = { color: { argb: "FFFF0000" } };
        hoja.getCell(filaDif, 3).fill = relleno(COLOR_ROJO);
      }
    }
  }

  hoja.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };
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
