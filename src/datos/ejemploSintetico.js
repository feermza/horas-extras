/**
 * Workspace sintético alineado con los ejemplos de la sección 5 y el Anexo B.
 * Solo para demostración y pruebas; no son datos reales.
 */

/** @type {import("./persistencia.js").Workspace} */
export const workspaceSintetico = {
  agentes: {
    agentes: [
      {
        id: "A001",
        legajo: 10001,
        dni: "12345678",
        nombre: "PEREZ, Juan Alberto",
        nombre_reloj: "PEREZ, JUAN",
        activo: true,
        configuraciones: [
          {
            vigencia_desde: "2026-01-01",
            vigencia_hasta: null,
            horario_inicio: "08:00",
            horario_fin: "14:30",
            duracion_jornada: "06:30",
            tope_extra_habil: "04:00",
            sabado_inicio: null,
            sabado_fin: null,
            sabado_tope: "00:00",
            tope_feriado: "04:00",
            tope_asueto: "04:00",
            tope_paro: "04:00",
            tope_lao_receso: "08:00",
            valor_hora_base: 4500,
          },
        ],
      },
    ],
  },
  calendario: {
    feriados: [
      {
        fecha: "2026-08-17",
        descripcion: "Paso a la Inmortalidad del Gral. San Martín",
      },
    ],
  },
  eventos: {
    eventos: [
      {
        fecha: "2026-08-20",
        tipo: "ASUETO",
        descripcion: "Asueto sintético",
        tope_especial: null,
      },
    ],
  },
  catalogos: {
    justificaciones: [
      { codigo: "RAZONES_PARTICULARES", descripcion: "RAZONES PARTICULARES", clase: "COMPLETA" },
      { codigo: "AUSENTE_POR_ENFERMEDAD", descripcion: "AUSENTE POR ENFERMEDAD", clase: "COMPLETA" },
      { codigo: "AUS_FAMILIAR_ENFERMO", descripcion: "AUS. FAMILIAR ENFERMO", clase: "COMPLETA" },
      { codigo: "LIC_ADEUDADA", descripcion: "LIC. ADEUDADA", clase: "COMPLETA" },
      { codigo: "DUELO", descripcion: "DUELO", clase: "COMPLETA" },
      { codigo: "DIA_NODOCENTE", descripcion: "DIA NODOCENTE", clase: "COMPLETA" },
      { codigo: "JUSTIF_POR_DIRECTOR", descripcion: "JUSTIF. POR DIRECTOR", clase: "COMPLETA" },
      { codigo: "A_CTA_LIC", descripcion: "A CTA. LIC.", clase: "COMPLETA" },
      { codigo: "LIC_LARGO_TRATAMIENTO", descripcion: "LIC. LARGO TRATAMIENTO", clase: "COMPLETA" },
      { codigo: "TELETRABAJO", descripcion: "TELETRABAJO", clase: "COMPLETA" },
      { codigo: "AUSENTE_POR_EXAMEN", descripcion: "AUSENTE POR EXAMEN", clase: "COMPLETA" },
      { codigo: "AUSENTE_COMPENSADO", descripcion: "AUSENTE COMPENSADO", clase: "COMPLETA" },
      { codigo: "HS_COMPENSADAS", descripcion: "HS. COMPENSADAS", clase: "COMPLETA" },
      { codigo: "DIAS_A_COMPENSAR", descripcion: "DIAS A COMPENSAR", clase: "COMPLETA" },
      { codigo: "LIC_X_ESTUDIO", descripcion: "LIC. X ESTUDIO", clase: "COMPLETA" },
      { codigo: "LIC_GREMIAL", descripcion: "LIC. GREMIAL", clase: "COMPLETA" },
      { codigo: "LIC_X_MATERNIDAD", descripcion: "LIC. X MATERNIDAD", clase: "COMPLETA" },
      { codigo: "LIC_X_MATRIMONIO", descripcion: "LIC. X MATRIMONIO", clase: "COMPLETA" },
      {
        codigo: "LICENCIA_ANUAL_ORDINARIA",
        descripcion: "LIC. ANUAL ORDINARIA",
        clase: "ESPECIAL_LAO_RECESO",
      },
      { codigo: "RECESO_INVERNAL", descripcion: "RECESO INVERNAL", clase: "ESPECIAL_LAO_RECESO" },
    ],
    permisos: [
      {
        codigo: "PERMISO_MEDIA_JORNADA",
        descripcion: "PERMISO MEDIA JORNADA",
        jornada_exigible: "03:30",
      },
      {
        codigo: "P_EXCEPCIONAL_A_86",
        descripcion: "P/EXCEPCIONAL A/86",
        jornada_exigible: "02:00",
      },
    ],
    umbral_minimo: "00:50",
    nombre_libro: "Becas 540",
    horas_maximas: "560:00",
  },
};
