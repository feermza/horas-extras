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
- Fase 3: calcularDia devuelve las magnitudes de 3.2 en minutos enteros, más factor, tipo, novedad (el objeto reconocido o null), metodo, avisos, bloqueante y editable. Hs_Final arranca igual a la computada. Cada aviso es { codigo, realizada, tope, excedente, novedad, texto }, sin el texto llano.
- Fase 3: editable es true solo si la realizada es mayor que 0 y no hay bloqueante. Una fecha bloqueada deja las magnitudes en 0, el factor en 1, el método en null, sin avisos y con editable false.
- Fase 3: las horas de las marcaciones se interpretan con parsearHora antes de duracionPar e intervaloDePar. null, undefined y "" son un extremo vacío; cualquier otro valor no interpretable bloquea la fecha con DATOS_HORARIOS_IMPOSIBLES y no lanza. Una hora de la configuración que sí está cargada y no se puede interpretar lanza RangeError.
- Fase 3: un par con ingreso y salida ambos vacíos se ignora. La vigencia contiene la fecha si vigencia_desde <= fecha y vigencia_hasta es null o fecha <= vigencia_hasta. Si dos configuraciones cubren la fecha, no se elige una: se lanza Error.
- Dos configuraciones vigentes para la misma fecha: calcularDia lanza Error como resguardo; la interfaz lo previene (5.1) y la fase 4 debe capturarlo por agente e informarlo como bloqueante, sin romper el programa.
- Una hora de la configuración mal formada lanza RangeError: es un dato roto, no DATOS_HORARIOS_IMPOSIBLES, que queda reservado para las marcaciones. La validación al guardar y al leer corresponde a las fases 5 y 8.
- La franja del sábado habilitado se cruza solo con [sabado_inicio, sabado_fin] y no se extiende pasada la medianoche.
- TURNO_DISTINTO_CONFIG no se implementa.
- Fase 4: liquidar({ minutosSimples, minutosDobles, valorHoraBase }) devuelve { minutosEquivalentes, importe }. El valor hora se lee como texto (String si llega número); coma y punto son separador decimal. El techo se hace una sola vez con BigInt.
- Fase 4: identificarAgente(nombre, agentes) compara el nombre normalizado con nombre y alias y no mira activo. Cero o más de una coincidencia devuelven null.
- Fase 4: calcularMes({ nombre, agentes, archivo, feriados, eventos, catalogo, finales }) devuelve { agente, periodo, dias, totales, bloqueantes, hayBloqueantes }. Cada día es el resultado de calcularDia más fecha y modificado. Si el agente no se identifica, dias y totales quedan en null y el bloqueante es AGENTE_SIN_CONFIGURACION con fecha null.
- Fase 4: los totales son las celdas C5 a C10 en minutos enteros, más importe y el valorHoraBase usado. El valor hora es el de la última configuración que cubre algún día del mes. Si ninguna cubre un día, el importe queda null.
- Un día sin configuración vigente no es bloqueante: calcularDia devuelve las magnitudes en 0, sin avisos, con editable false y bloqueante null.
- calcularMes no bloquea al agente por días fuera de la vigencia. Esos días aportan 0 a los totales.
- Fase 4: finales es un objeto o Map de fecha a minutos. Cada valor tiene que cumplir 0 <= final <= Hs_Extra_Realizada; si no, RangeError. Una fecha de finales que no es del mes también lanza RangeError. modificado es booleano: Hs_Final distinto de Hs_Computada_Sistema.
- Fase 4: una fecha del archivo fuera del período o repetida lanza Error y no elige fila. Vigencias superpuestas no rompen el cálculo del agente: se devuelve sin días ni totales, con bloqueante de codigo null y el mensaje del Error.
- Fase 4: textoAviso(aviso, umbralMinutos) redacta la tabla de 10.2. BAJO_UMBRAL usa el umbral recibido. Un código desconocido lanza RangeError. Los bloqueantes no tienen texto.
