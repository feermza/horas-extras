/**
 * Catálogo sintético del Anexo B.
 * Los códigos que no nombra la sección 5.4 se arman a partir de la descripción.
 */

/** @type {{ justificaciones: Array<{ codigo: string, descripcion: string, clase: string }>, permisos: Array<{ codigo: string, descripcion: string, jornada_exigible: string }> }} */
export const catalogo = {
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
    { codigo: "LICENCIA_ANUAL_ORDINARIA", descripcion: "LIC. ANUAL ORDINARIA", clase: "ESPECIAL_LAO_RECESO" },
    { codigo: "RECESO_INVERNAL", descripcion: "RECESO INVERNAL", clase: "ESPECIAL_LAO_RECESO" },
  ],
  permisos: [
    { codigo: "PERMISO_MEDIA_JORNADA", descripcion: "PERMISO MEDIA JORNADA", jornada_exigible: "03:30" },
    { codigo: "P_EXCEPCIONAL_A_86", descripcion: "P/EXCEPCIONAL A/86", jornada_exigible: "02:00" },
  ],
};
