# Decisiones técnicas de implementación

Estas notas son decisiones de implementación, no reglas de negocio.
Las reglas de negocio viven solo en docs/especificacion-v5.md.

- Fase 1: la Ñ se convierte en N al normalizar texto (NFD y eliminación de \p{M}). Confirmado por el usuario: no hay riesgo de choque.
- Fase 1: parsearHora y parsearDuracion son estrictas: no recortan espacios y devuelven null ante formato inválido; parsearDuracion no admite segundos.
- Fase 1: duracionPar e intervaloDePar lanzan RangeError si los minutos no son enteros entre 0 y 1439; quien las llame debe descartar antes los null de parsearHora.
- Fase 1: solapamiento devuelve 0 si el tramo común no es positivo, incluso con intervalos invertidos.
- Fase 2: el día de la semana se calcula con Date.UTC y getUTCDay; es el único uso de Date en el motor.
- Fase 2: dos feriados con la fecha pedida, o dos eventos del mismo tipo con esa fecha, lanzan Error. Un asueto y un paro el mismo día se resuelven por prioridad y no son error.
- Fase 2: la duplicación se mira solo entre entradas cuya fecha es igual a la pedida. No se valida el formato de las fechas de las listas.
- Fase 2: un tipo de evento distinto de ASUETO o PARO lanza RangeError en cualquier elemento del arreglo, aunque su fecha no sea la pedida.
- Fase 2: reconocerNovedad devuelve { estado, novedad, candidatas } y no emite avisos. Los estados son SIN_NOVEDAD, NO_RECONOCIDA, RECONOCIDA y DUPLICADA.
- Fase 2: la coincidencia exige la descripción normalizada como palabras completas y en orden, con espacios de borde. No hay alias.
- Fase 2: jornadaExigible se guarda en minutos enteros, parseados con parsearDuracion. La descripción del resultado es la del catálogo, sin normalizar.
- Fase 2: un catálogo con descripción vacía al normalizar, clase distinta de COMPLETA o ESPECIAL_LAO_RECESO, o jornada_exigible inválida lanza RangeError.
- Fase 2: el detalle de clasificarDia es el objeto original del feriado o del evento, o null. tope_especial no se interpreta en esta fase.
