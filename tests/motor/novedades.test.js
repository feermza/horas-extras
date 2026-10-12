import { describe, expect, it } from "vitest";
import { reconocerNovedad } from "../../src/motor/novedades.js";
import { normalizarTexto } from "../../src/motor/texto.js";
import { catalogo } from "./fixtures/catalogo.js";

/**
 * @param {string} observacion
 * @param {string} descripcion
 * @returns {boolean}
 */
function contieneSecuencia(observacion, descripcion) {
  return ` ${observacion} `.includes(` ${descripcion} `);
}

describe("reconocerNovedad", () => {
  it("reconoce cada descripción del Anexo B tal como la exporta el sistema", () => {
    expect(catalogo.justificaciones).toHaveLength(20);
    expect(catalogo.permisos).toHaveLength(2);

    for (const entrada of catalogo.justificaciones) {
      const resultado = reconocerNovedad(entrada.descripcion, catalogo);
      expect(resultado.estado).toBe("RECONOCIDA");
      expect(resultado.novedad.codigo).toBe(entrada.codigo);
      expect(resultado.novedad.tipo).toBe("JUSTIFICACION");
      expect(resultado.novedad.clase).toBe(entrada.clase);
      expect(resultado.candidatas).toEqual([entrada.codigo]);
    }
    for (const entrada of catalogo.permisos) {
      const resultado = reconocerNovedad(entrada.descripcion, catalogo);
      expect(resultado.estado).toBe("RECONOCIDA");
      expect(resultado.novedad.codigo).toBe(entrada.codigo);
      expect(resultado.novedad.tipo).toBe("PERMISO");
      expect(resultado.candidatas).toEqual([entrada.codigo]);
    }
  });

  it("no contiene una descripción normalizada dentro de otra", () => {
    const descripciones = [
      ...catalogo.justificaciones.map((entrada) => normalizarTexto(entrada.descripcion)),
      ...catalogo.permisos.map((entrada) => normalizarTexto(entrada.descripcion)),
    ];
    for (let i = 0; i < descripciones.length; i += 1) {
      for (let j = 0; j < descripciones.length; j += 1) {
        if (i === j) {
          continue;
        }
        expect(contieneSecuencia(descripciones[i], descripciones[j])).toBe(false);
      }
    }
  });

  it("reconoce mayúsculas, texto adicional, tildes y puntuación", () => {
    expect(reconocerNovedad("lic. anual ordinaria", catalogo).novedad.codigo)
      .toBe("LICENCIA_ANUAL_ORDINARIA");
    expect(reconocerNovedad("Ausente por enfermedad - certificado médico", catalogo).novedad.codigo)
      .toBe("AUSENTE_POR_ENFERMEDAD");
    expect(reconocerNovedad("dúelo", catalogo).novedad.codigo).toBe("DUELO");
    expect(reconocerNovedad("AUSENTE, POR ENFERMEDAD", catalogo).novedad.codigo)
      .toBe("AUSENTE_POR_ENFERMEDAD");
  });

  it("texto ajeno al catálogo o mal formado queda sin novedad", () => {
    const ajenos = [
      "LICENCIA ANUAL ORDINARIA",
      "LAO",
      "AUSENTE ENFERMEDAD",
      "ENFERMEDAD POR AUSENTE",
      "DUELOS",
      "SOLIC ADEUDADA",
      "Fin de semana",
      "Excede horario",
    ];
    for (const texto of ajenos) {
      const resultado = reconocerNovedad(texto, catalogo);
      expect(resultado.estado).toBe("SIN_NOVEDAD");
      expect(resultado.novedad).toBeNull();
      expect(resultado.candidatas).toEqual([]);
    }
  });

  it("trata vacío, espacios y puntuación como sin novedad", () => {
    for (const texto of ["", "   ", "...", null, undefined]) {
      expect(reconocerNovedad(texto, catalogo)).toEqual({
        estado: "SIN_NOVEDAD",
        novedad: null,
        candidatas: [],
      });
    }
  });

  it("marca dos entradas distintas como duplicadas (caso 19) y una repetida como una sola", () => {
    const duplicada = reconocerNovedad("AUSENTE POR ENFERMEDAD DUELO", catalogo);
    expect(duplicada.estado).toBe("DUPLICADA");
    expect(duplicada.novedad).toBeNull();
    expect(duplicada.candidatas).toEqual(["AUSENTE_POR_ENFERMEDAD", "DUELO"]);

    const repetida = reconocerNovedad("DUELO DUELO", catalogo);
    expect(repetida.estado).toBe("RECONOCIDA");
    expect(repetida.novedad.codigo).toBe("DUELO");
    expect(repetida.candidatas).toEqual(["DUELO"]);
  });

  it("devuelve la jornada exigible del permiso en minutos", () => {
    expect(reconocerNovedad("PERMISO MEDIA JORNADA", catalogo).novedad.jornadaExigible).toBe(210);
    expect(reconocerNovedad("P/EXCEPCIONAL A/86", catalogo).novedad.jornadaExigible).toBe(120);
  });

  it("lanza RangeError si el catálogo es inválido", () => {
    expect(() => reconocerNovedad("DUELO", {
      justificaciones: [{ codigo: "X", descripcion: "...", clase: "COMPLETA" }],
      permisos: [],
    })).toThrow(RangeError);
    expect(() => reconocerNovedad("DUELO", {
      justificaciones: [{ codigo: "X", descripcion: "DUELO", clase: "OTRA" }],
      permisos: [],
    })).toThrow(RangeError);
    expect(() => reconocerNovedad("DUELO", {
      justificaciones: [],
      permisos: [{ codigo: "P", descripcion: "PERMISO", jornada_exigible: "xx" }],
    })).toThrow(RangeError);
  });

  it("no modifica la observación ni el catálogo", () => {
    const observacion = "AUSENTE POR ENFERMEDAD";
    const congelado = Object.freeze({
      justificaciones: Object.freeze(catalogo.justificaciones.map((entrada) => Object.freeze({ ...entrada }))),
      permisos: Object.freeze(catalogo.permisos.map((entrada) => Object.freeze({ ...entrada }))),
      umbral_minimo: "00:50",
    });
    const antes = JSON.stringify(congelado);
    reconocerNovedad(observacion, congelado);
    expect(observacion).toBe("AUSENTE POR ENFERMEDAD");
    expect(JSON.stringify(congelado)).toBe(antes);
  });
});
