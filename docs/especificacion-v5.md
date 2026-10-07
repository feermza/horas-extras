# ESPECIFICACIÓN FUNCIONAL Y TÉCNICA: MOTOR DE CÁLCULO DE HORAS EXTRAS E INFORME PARA REVISIÓN

**Versión 5.1.** Documento único y autosuficiente para implementar el sistema. Reemplaza a las v3, v4 y v5.

---

## 0. REGLAS DE TRABAJO PARA EL ASISTENTE DE PROGRAMACIÓN

1. Este documento es la **única fuente de reglas de negocio**. No inventar reglas, valores ni casos.
2. Si algo es ambiguo, falta o se contradice, **detenerse y listar la pregunta** en lugar de implementar una suposición. Los supuestos ya adoptados están en la sección 18.
3. No modificar este documento. Proponer cambios por separado.
4. Trabajar **por fases** (sección 15). No pasar a la fase siguiente sin que las pruebas de la actual estén en verde.
5. El motor de cálculo es un módulo **puro**: sin DOM, sin lectura de archivos, sin Excel, sin acceso a red. Recibe datos y devuelve resultados.
6. No usar coma flotante para tiempo ni dinero (ver 3.1 y 9).
7. Sin conexiones de red, sin CDN en tiempo de ejecución, sin telemetría. Los datos nunca salen de la PC.
8. **Nunca incluir datos reales de personas** (nombres, DNI, importes reales) en el código, las pruebas ni los ejemplos. Usar datos sintéticos.

---

## 1. OBJETIVO Y ALCANCE

Procesar archivos mensuales individuales (uno por agente) exportados por un sistema de control de acceso, para determinar:

- las horas efectivamente trabajadas;
- las horas extra realizadas;
- las horas extra que el sistema computa según lo autorizado a cada agente;
- el excedente que debe revisar y, si corresponde, autorizar el jefe del área.

Con eso se genera un **libro Excel mensual** para que el jefe revise y edite lo que autoriza. El libro devuelto por el jefe es la **planilla final**. Con ella el área de RRHH confecciona una resolución de pago; la planilla queda además como documento de consulta para auditorías.

### 1.1. Actores

- **RRHH:** usa el programa, carga los archivos exportados, configura agentes y calendarios, genera el libro.
- **Jefe del área que revisa:** recibe el libro, revisa y edita la columna de horas finales. Hay un solo jefe por grupo de agentes.

### 1.2. Fuera de alcance de esta versión

- Bloque de diferencias y arrastre de horas entre meses (columnas de "Dif. Hs a Otorgar" de la planilla de ejemplo).
- Autorizaciones excepcionales cargadas de antemano (la autorización la da el jefe editando el libro).
- Acceso del jefe mediante un sistema web con usuarios.
- Diseño visual final de la aplicación.

---

## 2. ARQUITECTURA Y RESTRICCIONES TÉCNICAS

- **Plataforma:** aplicación local de **un único archivo HTML** con JavaScript, que se abre con doble clic en Edge o Chrome. Sin instalación, sin servidor, sin internet. Verificado en la PC de trabajo (lectura de `.xlsx`, descarga de archivos, almacenamiento y acceso a carpetas).
- **Lenguaje:** JavaScript (módulos ES). Se admite TypeScript.
- **Interfaz sugerida:** Vue 3.
- **Compilación:** Vite con `vite-plugin-singlefile`. El resultado debe funcionar abierto como `file://` (sin módulos ES externos en tiempo de ejecución).
- **Pruebas:** Vitest.
- **Excel:** ExcelJS para **escribir** el libro (soporta estilos, fórmulas, protección de hojas, validación de datos y formato condicional) y para leerlo al importar. No usar la edición comunitaria de SheetJS para escribir, porque no garantiza estilos ni protección.
- **Persistencia:** archivos **JSON** en una carpeta de trabajo, leídos y escritos con la File System Access API (Edge/Chrome). Como alternativa, exportar e importar JSON manualmente. No usar `localStorage` para datos de negocio.
- **Estructura de carpetas de datos:**

```
datos/
  agentes.json
  grupos.json
  calendario.json      (feriados)
  eventos.json         (asuetos y paros)
  catalogos.json       (justificaciones y permisos)
  periodos/
    2026-08/
      emision-<codigo>.json
```

---

## 3. CONCEPTOS BASE

### 3.1. Representación del tiempo

- Todo tiempo se maneja internamente como **minutos enteros**. Se muestra como `H:MM`.
- Las marcaciones se normalizan al minuto. Si el archivo trajera segundos, se truncan al minuto.
- Duración de un par: si `salida >= ingreso`, `salida - ingreso`; si `salida < ingreso`, hay cruce de medianoche y se suma 1440 antes de restar.
- La salida de un par figura siempre en la fila del día de ingreso, aunque ocurra después de la medianoche (por ejemplo, ingreso 08:00 y salida 00:03 en la misma fila).
- La conversión a horas decimales ocurre solo en la liquidación (sección 9).

### 3.2. Magnitudes de un día (nombres fijos)

| Nombre | Significado |
|---|---|
| `Hs_Trab` | Tiempo efectivamente trabajado en el día. |
| `Hs_Extra_Realizada` | Tiempo trabajado que, por el tipo de día, puede ser hora extra. Es lo que el agente hizo, esté o no autorizado. |
| `Tope_Aplicable` | Horas autorizadas al agente para ese tipo de día. Un tope no definido vale `00:00`. |
| `Hs_Computada_Sistema` | Lo que el sistema computa: depende del umbral y del tope. |
| `Hs_Excedente` | `Hs_Extra_Realizada - Hs_Computada_Sistema`. Es lo que el jefe puede autorizar. |
| `Hs_Final` | Lo que finalmente se computa. Empieza igual a `Hs_Computada_Sistema` y el jefe puede editarla. Siempre cumple `0 <= Hs_Final <= Hs_Extra_Realizada`. |
| `Hs_No_Computable` | Tiempo trabajado que no puede ser extra (por ejemplo, fuera de la modalidad). Se muestra y no se contabiliza. |

### 3.3. Tipos de día y prioridad

Para cada fecha se determina un único tipo de día con esta prioridad:

1. `FERIADO` (calendario de feriados).
2. `ASUETO` (eventos).
3. `PARO` (eventos).
4. `SABADO`.
5. `DOMINGO`.
6. `HABIL_NORMAL`.

Si un feriado cae en sábado o domingo, prevalece `FERIADO`. Feriados, asuetos y paros se determinan **solo por fecha** desde sus estructuras, nunca por texto libre.

El tipo de día se sigue determinando con esta prioridad y se muestra en el informe. Excepción de cálculo: la `LIC. ANUAL ORDINARIA` prevalece sobre el tipo de día en las reglas de cálculo (ver 6.3 y 8.2).

### 3.4. Un agente no parte sus horas extras

En días hábiles las horas extras se hacen exclusivamente antes o exclusivamente después de la jornada, según la modalidad del agente. Nunca ambas el mismo día.

### 3.5. Una sola novedad por fecha

Cada fecha de un agente tiene como máximo una novedad (justificación o permiso). Si el motor reconoce más de una, genera `NOVEDAD_DUPLICADA_EN_FECHA` (bloqueante para esa fecha).

---

## 4. ENTRADA: ARCHIVO MENSUAL EXPORTADO

Cada archivo corresponde a un agente y a un mes. Datos a extraer:

- `Nombre`.
- `Fecha`.
- `Día`.
- `Turno`.
- Hasta tres pares `Ingreso` / `Salida`.
- `Observaciones`.

`Día` y `Turno` se conservan para contraste y auditoría; no son fuente de configuración. `Observaciones` se conserva íntegra. Si la salida de un par ocurre después de la medianoche, figura igualmente en la fila del día de ingreso. Las justificaciones de inasistencia se cargan en el sistema de origen desde un desplegable con una lista fija de opciones (Anexo B.1): el texto de la observación es el de una opción, sin variantes ni agregados.

**Mapeo de columnas pendiente.** La posición exacta de columnas, la fila de encabezado y el formato de fechas y horas deben tomarse del archivo real exportado (con datos anonimizados). Hasta tenerlo, la capa de importación se implementa detrás de esta interfaz y se prueba con datos sintéticos:

```
leerArchivoMensual(archivo) -> {
  nombre,            // texto tal como figura
  periodo,           // { anio, mes }
  dias: [ { fecha, dia, turno, marcaciones: [ { ingreso, salida } ], observacion } ]
}
```

---

## 5. MODELO DE DATOS (JSON)

Los ejemplos usan datos sintéticos. Las horas se guardan como texto `"HH:MM"`.

### 5.1. `agentes.json`

```json
{
  "agentes": [
    {
      "id": "A001",
      "legajo": 10001,
      "dni": "12345678",
      "nombre": "PEREZ, Juan A.",
      "alias": ["PEREZ, J."],
      "concepto": "PREST. COMPL.",
      "grupo": "grupo-1",
      "activo": true,
      "configuraciones": [
        {
          "vigencia_desde": "2026-01-01",
          "vigencia_hasta": null,
          "horario_inicio": "08:00",
          "horario_fin": "14:30",
          "duracion_jornada": "06:30",
          "modalidad_extra_habil": "DESPUES",
          "tope_extra_habil": "04:00",
          "sabado_habilitado": false,
          "sabado_inicio": null,
          "sabado_fin": null,
          "sabado_tope": "00:00",
          "tope_feriado": "04:00",
          "tope_asueto": "04:00",
          "tope_paro": "04:00",
          "tope_lao_receso": "08:00",
          "valor_hora_base": 4500
        }
      ]
    }
  ]
}
```

Reglas:

- `legajo`, `dni` y `concepto` se usan en el informe y en la resolución de pago; no intervienen en el cálculo.
- **Vigencia:** para calcular una fecha se usa la configuración cuya vigencia la contenga. Permite recalcular meses pasados con los valores de entonces. Si ninguna cubre la fecha, `AGENTE_SIN_CONFIGURACION` (bloqueante).
- **Topes propios:** cada agente tiene sus propios topes por tipo de día. No existen topes generales de respaldo. Un tope vacío se interpreta como `00:00`.
- Al dar de alta o editar una configuración, la interfaz **exige completar todos los topes** (0 es válido) para que un valor faltante no pase inadvertido. El alta precarga `tope_lao_receso` con `08:00`.
- `modalidad_extra_habil`: `ANTES` o `DESPUES`.
- `duracion_jornada` se conserva como dato explícito de control y se puede validar contra `horario_fin - horario_inicio`.
- Un agente se identifica comparando su nombre normalizado (regla de normalización en 6.1) con `nombre` y `alias`. Sin coincidencia única: `AGENTE_SIN_CONFIGURACION`.

### 5.2. `grupos.json`

```json
{
  "grupos": [
    {
      "id": "grupo-1",
      "nombre": "Becas 540",
      "concepto": "PREST. COMPL.",
      "horas_maximas": "560:00"
    }
  ]
}
```

`horas_maximas` es opcional. Es el máximo de horas a abonar del grupo en el mes, y se usa solo para un control en el resumen (sección 11.5).

### 5.3. `calendario.json` y `eventos.json`

```json
{ "feriados": [ { "fecha": "2026-08-17", "descripcion": "Paso a la Inmortalidad del Gral. San Martín" } ] }
```

```json
{ "eventos": [ { "fecha": "2026-08-20", "tipo": "ASUETO", "descripcion": "…", "tope_especial": null } ] }
```

`tipo` es `ASUETO` o `PARO`. `tope_especial` es opcional; si existe, **prevalece** sobre el tope del agente para esa fecha (salvo con `LIC. ANUAL ORDINARIA`, ver 8.2).

### 5.4. `catalogos.json`

```json
{
  "justificaciones": [
    { "codigo": "LICENCIA_ANUAL_ORDINARIA", "descripcion": "LIC. ANUAL ORDINARIA", "clase": "ESPECIAL_LAO_RECESO" },
    { "codigo": "AUSENTE_POR_ENFERMEDAD", "descripcion": "AUSENTE POR ENFERMEDAD", "clase": "COMPLETA" }
  ],
  "permisos": [
    { "codigo": "PERMISO_MEDIA_JORNADA", "descripcion": "PERMISO MEDIA JORNADA", "jornada_exigible": "03:30" }
  ],
  "umbral_minimo": "00:50"
}
```

Las novedades no tienen alias: se reconocen solo por su descripción.

Los catálogos iniciales están en el Anexo B. Los valores de `jornada_exigible` y el `umbral_minimo` son datos, no constantes de código.

---

## 6. NOVEDADES EN OBSERVACIONES

### 6.1. Normalización de texto

Para comparar textos: pasar a mayúsculas, quitar tildes, reemplazar puntuación por espacios y colapsar espacios múltiples. Se aplica a nombres de agente, observaciones y catálogos.

### 6.2. Reconocimiento

1. Normalizar la observación.
2. Buscar en justificaciones y permisos las entradas cuya descripción normalizada aparezca en la observación como **secuencia de palabras completas**.
3. Una coincidencia: se asigna el código interno. Cero: si la observación no está vacía, se genera `OBSERVACION_NO_RECONOCIDA` (advertencia), el día se calcula sin novedad y el cálculo no se frena; si está vacía, no hay novedad. Más de una entrada del catálogo: `NOVEDAD_DUPLICADA_EN_FECHA` (bloqueante). Por diseño del sistema de origen no se espera más de una novedad por fecha; esta detección es una red de seguridad.
4. La observación original siempre se conserva.

### 6.3. Efecto de cada clase de novedad (en `HABIL_NORMAL`; la `LIC. ANUAL ORDINARIA` tiene una excepción al final de esta sección)

- `COMPLETA`: `Jornada_Exigible = 00:00`; no habilita extras.
- `ESPECIAL_LAO_RECESO` (licencia anual ordinaria y receso invernal): `Jornada_Exigible = 00:00`; permite extras por razones de servicio.
- Permiso parcial: la jornada exigible pasa a ser la del permiso (por ejemplo, 03:30 o 02:00) en lugar de la jornada normal.

En días que no son `HABIL_NORMAL` las novedades se conservan para auditoría y no modifican el cálculo, con una excepción: la `LIC. ANUAL ORDINARIA` prevalece sobre el tipo de día. El sistema de origen la informa como días corridos, en la observación de todas las filas que cubre, incluidos sábados, domingos, feriados, asuetos y paros; por eso se reconoce fila por fila, sin mirar los días vecinos. En esas fechas se aplica la regla de `ESPECIAL_LAO_RECESO` de 8.2 con factor 1. `RECESO INVERNAL` y las justificaciones de clase `COMPLETA` no tienen esta excepción. En cada fecha rige una sola novedad (3.5): si una fecha de la licencia trae en cambio una justificación de clase `COMPLETA` (por ejemplo enfermedad o duelo), rige esa justificación.

---

## 7. CÁLCULO DEL TIEMPO TRABAJADO

### 7.1. Regla primaria: pares de marcaciones

`Hs_Trab = Σ duración(ingreso_k, salida_k)` sobre los pares completos (3.1).

### 7.2. Regla de contingencia: MAX-MIN

Si no se pueden formar pares completos y confiables: `Hs_Trab = MAX(marcaciones) - MIN(marcaciones)`. Se marca el método como `MAX_MIN_ESTIMADO` y se genera `MARCACIONES_INCOMPLETAS` (advertencia). El método normal es `PARES_VALIDOS`.

### 7.3. Datos imposibles

Horas ilegibles o inconsistentes: `DATOS_HORARIOS_IMPOSIBLES` (bloqueante para esa fecha).

---

## 8. CÁLCULO DIARIO: REALIZADAS, TOPE Y COMPUTADAS

### 8.1. Orden estricto

```
para cada fecha del mes:
  cfg      = configuracion_vigente(agente, fecha)            // si no hay: bloqueante
  tipo     = clasificar_dia(fecha)                           // 3.3
  novedad  = reconocer_novedad(observacion)                  // 6.2
  trab     = tiempo_trabajado(marcaciones)                   // 7
  (realizada, no_computable, tope, factor) = reglas_por_tipo(tipo, novedad, cfg, trab)
  si realizada >= umbral_minimo:
      computada = min(realizada, tope)
  sino:
      computada = 0
  excedente = realizada - computada
  final_inicial = computada
```

### 8.2. Reglas por tipo de día (`reglas_por_tipo`)

**Excepción: `LIC. ANUAL ORDINARIA` en días que no son hábiles normales.** Si la fecha tiene la novedad `LIC. ANUAL ORDINARIA` y su tipo de día es `FERIADO`, `ASUETO`, `PARO`, `SABADO` o `DOMINGO`: `realizada = trab`, `tope = cfg.tope_lao_receso`, `factor = 1`, sin modalidad ni franja y sin tiempo no computable. La licencia prevalece sobre el tipo de día, incluido el `tope_especial` de un evento: en `ASUETO` o `PARO` se usa `cfg.tope_lao_receso`, no el `tope_especial`. En `HABIL_NORMAL` rige la regla de `ESPECIAL_LAO_RECESO` de más abajo, que da el mismo resultado. No se generan los avisos `TRABAJO_DOMINGO_SIN_AUTORIZACION` ni `TRABAJO_SABADO_NO_HABILITADO`; si `tope_lao_receso` fuera `00:00`, corresponde `SIN_AUTORIZACION_DIA`. Las reglas por tipo de día que siguen se aplican cuando no rige esta excepción.

**`HABIL_NORMAL`**

- Novedad `COMPLETA`: `realizada = 0`, `tope = 0`. Si `trab > 0`, advertencia `MARCACIONES_EN_DIA_JUSTIFICADO`.
- Novedad `ESPECIAL_LAO_RECESO`: `realizada = trab`, `tope = cfg.tope_lao_receso`.
- Permiso parcial: `realizada = max(0, trab - jornada_exigible_reducida)`, en cualquier momento del día (sin modalidad ni franja); `tope = cfg.tope_extra_habil`. Si `trab <= jornada_exigible_reducida`, no hay extras ni aviso.
- Sin novedad: se calcula la **intersección** entre los intervalos trabajados y la ventana de la modalidad. `ANTES`: tiempo anterior a `horario_inicio`. `DESPUES`: tiempo posterior a `horario_fin`. `realizada` es esa intersección. El tiempo trabajado del otro lado de la franja es `no_computable`: se muestra y **no genera advertencia**. `tope = cfg.tope_extra_habil`.

**`SABADO`**

- Habilitado: `realizada` = tiempo trabajado dentro de `[sabado_inicio, sabado_fin]`; el tiempo fuera es `no_computable` (se muestra, sin advertencia); `tope = cfg.sabado_tope`.
- No habilitado: `realizada = trab`, `tope = 0`. Si `trab > 0`, advertencia `TRABAJO_SABADO_NO_HABILITADO`.

**`DOMINGO`**: `realizada = trab`, `tope = 0`. Si `trab > 0`, advertencia `TRABAJO_DOMINGO_SIN_AUTORIZACION`. El jefe decide si lo autoriza.

**`FERIADO`**: `realizada = trab`, `tope = cfg.tope_feriado`, `factor = 2`.

**`ASUETO`**: `realizada = trab`, `tope = evento.tope_especial` si existe, si no `cfg.tope_asueto`, `factor = 1`.

**`PARO`**: igual que `ASUETO`, con `cfg.tope_paro`, `factor = 1`.

Todos los demás casos tienen `factor = 1`.

### 8.3. Umbral

`umbral_minimo = 00:50`, parametrizable. Es **inclusivo**: se computa desde `00:50` inclusive. Por debajo, `computada = 0` y el aviso es de bajo umbral.

### 8.4. Casos que el jefe puede autorizar

El campo editable `Hs_Final` admite cualquier valor entre `0` y `Hs_Extra_Realizada`. Por eso el jefe puede autorizar domingos, sábados no habilitados, excedentes sobre el tope y tiempos por debajo del umbral.

---

## 9. LIQUIDACIÓN

La liquidación se hace sobre `Hs_Final` (la planilla final), agrupada por agente y mes:

```
minutos_simples      = Σ Hs_Final de los días con factor 1
minutos_dobles       = Σ Hs_Final de los días con factor 2
minutos_equivalentes = minutos_simples + 2 * minutos_dobles
importe              = techo( minutos_equivalentes * valor_hora_base / 60 )
```

- El importe es **entero** (sin decimales) y se redondea siempre **hacia arriba**, una sola vez por agente y mes.
- Usar aritmética entera o decimal exacta; nunca coma flotante.
- Las horas dobles (feriados) se expresan como horas equivalentes (cada hora doble cuenta por dos), de modo que el resumen mantiene un único valor por hora. Ver supuesto 1 en la sección 18.
- Si `valor_hora_base` fuera decimal, usar aritmética decimal exacta antes de aplicar el techo.

---

## 10. AVISOS E INCONSISTENCIAS

### 10.1. Bloqueantes

Impiden calcular la fecha afectada (o al agente completo, en el primer caso) hasta que se resuelvan:

- `AGENTE_SIN_CONFIGURACION` (afecta al agente completo; no se genera su hoja).
- `NOVEDAD_DUPLICADA_EN_FECHA`.
- `DATOS_HORARIOS_IMPOSIBLES`.

Una fecha bloqueada aparece en el informe en rojo, con `Realizada = 0` y no editable.

### 10.2. Advertencias y avisos

Se calcula normalmente y se marca. El aviso se redacta en lenguaje llano, para el jefe:

| Código | Texto del aviso |
|---|---|
| `EXCEDENTE_SOBRE_TOPE` | "Realizó {realizada}, autorizadas {tope}: {excedente} para autorizar" |
| `SIN_AUTORIZACION_DIA` | "Sin horas autorizadas para este tipo de día: {realizada} para autorizar" |
| `BAJO_UMBRAL` | "Menos de 0:50: no se computa" |
| `TRABAJO_DOMINGO_SIN_AUTORIZACION` | "Trabajó en domingo: {realizada} para autorizar" |
| `TRABAJO_SABADO_NO_HABILITADO` | "Trabajó en sábado no habilitado: {realizada} para autorizar" |
| `MARCACIONES_EN_DIA_JUSTIFICADO` | "Hay marcaciones en un día justificado ({novedad})" |
| `MARCACIONES_INCOMPLETAS` | "Marcaciones incompletas: horas estimadas" |
| `OBSERVACION_NO_RECONOCIDA` | "Observación no reconocida: {texto}" |
| `TURNO_DISTINTO_CONFIG` | "El turno informado difiere de la configuración" |

Elección del aviso por exceso: si `realizada > 0` y `computada < realizada`, el motivo es `BAJO_UMBRAL` si `realizada < umbral`; si no, `SIN_AUTORIZACION_DIA` (o el aviso específico de domingo o sábado) si `tope = 0`; si no, `EXCEDENTE_SOBRE_TOPE`. Excepción: con `LIC. ANUAL ORDINARIA` en un día que no es hábil normal (8.2), si el tope es cero se usa siempre `SIN_AUTORIZACION_DIA`, nunca los avisos específicos de domingo o sábado.

El tiempo `no_computable` por modalidad o por franja de sábado se muestra pero **no genera aviso**.

---

## 11. INFORME: LIBRO EXCEL MENSUAL

### 11.1. Estructura del libro

Un único libro por grupo y mes, llamado `{Grupo} - {MM}-{AAAA}.xlsx` (por ejemplo, `Becas 540 - 08-2026.xlsx`), con estas hojas en este orden:

1. `Resumen`.
2. Una hoja por agente. Nombre: `{Apellido}, {inicial}` sin caracteres no válidos (`: \ / ? * [ ]`), de hasta 31 caracteres y único dentro del libro.
3. `Control` (oculta).

### 11.2. Hoja de agente: posiciones fijas

Los totales están **arriba** de la tabla, en celdas fijas, para que su posición no dependa de los días del mes.

| Celda | Contenido |
|---|---|
| `A1` | Título: `INFORME DE HORAS EXTRAS - {MES}/{AÑO}` |
| `A2` / `B2` | `Agente:` / nombre |
| `D2` / `E2` | `Legajo:` / legajo |
| `G2` / `H2` | `DNI:` / DNI |
| `A3` / `B3` | `Concepto:` / concepto |
| `D3` / `E3` | `Grupo:` / nombre del grupo |
| `G3` / `H3` | `Valor hora:` / `valor_hora_base` |
| `A5` / `C5` | `Hs. extra realizadas` / total |
| `A6` / `C6` | `Hs. computadas por el sistema` / total |
| `A7` / `C7` | `Hs. finales simples` / total |
| `A8` / `C8` | `Hs. finales dobles` / total |
| `A9` / `C9` | `Hs. finales equivalentes` / total |
| `A10` / `C10` | `Importe` / total |

Fila 12: encabezados de la tabla. Filas 13 en adelante: **una fila por cada día del mes**, incluidos los días sin trabajo, para que el jefe vea el mes completo. Se congela el encabezado.

Columnas de la tabla diaria:

| Col. | Contenido | Editable |
|---|---|---|
| A | Fecha | No |
| B | Día de la semana | No |
| C | Tipo de día | No |
| D | Turno informado | No |
| E a J | Ingreso 1, Salida 1, Ingreso 2, Salida 2, Ingreso 3, Salida 3 | No |
| K | Observación original | No |
| L | Hs. trabajadas | No |
| M | Hs. no computables | No |
| N | Hs. extra realizadas | No |
| O | Hs. autorizadas (tope aplicable) | No |
| P | Hs. computadas (sistema) | No |
| Q | Excedente | No |
| R | Factor (1 o 2) | No |
| S | **Hs. finales** | **Sí** |
| T | Modificado | No |
| U | Aviso | No |

Las horas se guardan como valores de hora de Excel (fracción de día = `minutos / 1440`) con formato `[h]:mm`.

### 11.3. Fórmulas de la hoja de agente

`F` es la primera fila de datos (13) y `L` la última (`12 + días del mes`).

- `Q{r}`: `=ROUND(MAX(0,N{r}-P{r})*1440,0)/1440`
- `S{r}`: valor inicial igual a `P{r}` (constante, no fórmula).
- `T{r}`: `=IF(ROUND((S{r}-P{r})*1440,0)<>0,"SÍ","")`
- `C5`: `=SUM(N13:N{L})`
- `C6`: `=SUM(P13:P{L})`
- `C7`: `=SUMIF(R13:R{L},1,S13:S{L})`
- `C8`: `=SUMIF(R13:R{L},2,S13:S{L})`
- `C9`: `=C7+2*C8`
- `C10`: `=ROUNDUP(ROUND(C9*1440,0)*H3/60,0)`

El `ROUND(...*1440,0)` evita errores de coma flotante antes del `ROUNDUP`.

Para cada celda con fórmula se debe escribir también el **valor calculado** (`result` en ExcelJS), de modo que los visores que no recalculan muestren datos correctos.

### 11.4. Protección, validación y colores

- Todas las hojas se protegen **sin contraseña**.
- En las hojas de agente, solo las celdas de la columna `S` de las filas con `N > 0` están desbloqueadas. En los demás días, `S` queda bloqueada.
- **Validación de datos** en `S`: valor entre `0` y `N{r}` (no se puede autorizar más de lo realizado). Mensaje de error en español.
- Las filas con bloqueante quedan en rojo y `S` bloqueada.
- Colores de fondo de la fila, según el aviso:
  - amarillo `#FFF2CC`: excedente para autorizar, sin autorización o bajo umbral;
  - naranja `#F8CBAD`: trabajo en domingo o sábado no habilitado;
  - gris `#EDEDED`: día sin trabajo, día justificado o día no laborable sin marcaciones;
  - rojo `#F4B6B6`: bloqueante.
- La columna `S` se distingue con fondo azul claro `#DDEBF7`. Con formato condicional, una fila con `T = "SÍ"` resalta `S` en verde claro `#E2EFDA`.
- Impresión: A4 horizontal, ajustada a un ancho de página, una hoja de agente por página.

### 11.5. Hoja `Resumen`

Replica el formato de la planilla de consulta mensual.

- `C1`: `{MES}/{AÑO}` (por ejemplo, `AGOSTO/2026`). Los textos de período se generan a partir del mes; nunca quedan meses fijos.
- Encabezados de la tabla en la fila 2: `Legajo Nº`, `Apellido y Nombres`, `DNI`, `CONCEPTO`, `Monto/Hora`, `Horas`, `Monto Total`.
- Una fila por agente, desde la fila 3, en orden de legajo.
  - `F{r}` = `='{Hoja del agente}'!$C$9` (horas equivalentes finales).
  - `G{r}` = `=ROUNDUP(ROUND(F{r}*1440,0)*E{r}/60,0)`.
  - `E{r}` toma el `valor_hora_base` vigente del agente.
- Fila de totales: suma de `F` y de `G`.
- Si el grupo tiene `horas_maximas`, debajo de los totales se agrega el control:
  - `Cant. Máxima de Hs. a abonar (A)`: el valor configurado y su monto (`máximo × valor hora`).
  - `Total de horas (B)`: la suma de la columna `F`.
  - `Diferencia (A - B)`: `=IF(B>A,"SE SUPERA EL MÁXIMO POR "&TEXT(B-A,"[h]:mm"),A-B)`; en rojo si se supera.
- No se genera el bloque de diferencias ni el arrastre entre meses (1.2).

### 11.6. Hoja `Control` (oculta)

Contiene:

- `codigo_emision` (identificador único de esta generación), fecha y hora de generación, período, grupo, versión de la especificación (5.1) y versión del motor.
- Una tabla con una fila por agente: `agente_id`, nombre de la hoja, legajo y la configuración vigente aplicada (horario, modalidad, topes, valor hora). Así el libro es auditable aun sin el programa.

---

## 12. IMPORTAR EL LIBRO DEVUELTO (OPCIONAL)

El libro devuelto por el jefe **ya es la planilla final**: sus totales y su resumen se actualizan solos. Importarlo en el programa es un paso opcional que permite guardar el estado y leer los valores finales.

1. Leer la hoja `Control` y obtener `codigo_emision`. Si no coincide con una emisión conocida del período, avisar y no importar.
2. Para cada hoja de agente, leer la columna `S` por fecha. Validar `0 <= S <= N`. Registrar las filas donde `S` difiere de `P`.
3. Recalcular con el motor los totales por agente y compararlos con los del libro. Si difieren, avisar (posible alteración de fórmulas).
4. Guardar en `emision-<codigo>.json` el estado `REVISADA`, la fecha de importación y los valores finales por agente y fecha.

---

## 13. AUDITORÍA

Por cada agente, fecha y emisión se conserva en `emision-<codigo>.json`:

- identificación del agente, fecha, día y turno informado;
- observación original, novedad detectada y código interno;
- tipo de día;
- configuración aplicada (copia de los valores, con su vigencia);
- jornada normal y jornada exigible;
- marcaciones originales;
- `Hs_Trab` y método (`PARES_VALIDOS` o `MAX_MIN_ESTIMADO`);
- modalidad extra;
- `Hs_Extra_Realizada`, `Hs_No_Computable`, `Tope_Aplicable`, `Hs_Computada_Sistema`, `Hs_Excedente`;
- umbral aplicado y factor;
- `Hs_Final` (inicial y, tras importar, la editada);
- avisos y bloqueantes con su código;
- versión de la especificación y del motor.

---

## 14. INTERFAZ MÍNIMA (RRHH)

1. **Configuración:** alta y edición de agentes (con su historial de vigencias y todos los topes obligatorios), grupos, feriados, eventos (asuetos y paros) y catálogos.
2. **Período:** elegir la carpeta o los archivos mensuales exportados; mostrar por agente el resultado, los avisos y los bloqueantes, con una forma de corregir los datos faltantes.
3. **Generar libro:** deshabilitado mientras haya bloqueantes, salvo confirmación explícita (las fechas afectadas quedan en rojo y bloqueadas).
4. **Importar libro devuelto** (opcional, sección 12).

---

## 15. FASES DE IMPLEMENTACIÓN

Cada fase termina con pruebas en verde y se confirma antes de avanzar.

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| 0 | Esqueleto: Vite con `vite-plugin-singlefile`, Vitest, carpetas. | El HTML generado se abre con doble clic y ejecuta una prueba trivial. |
| 1 | Utilidades de tiempo (parseo, formato, duración con cruce de medianoche, intersección de intervalos) y normalización de texto. | Pruebas unitarias, incluido el caso 17 del Anexo A. |
| 2 | Clasificación del día y reconocimiento de novedades. | Prioridad de tipos de día; reconocimiento por descripción; duplicados detectados. |
| 3 | Cálculo diario (secciones 7 y 8). | Casos 1 a 24 del Anexo A. |
| 4 | Cálculo mensual por agente, liquidación (9) y avisos (10). | Casos de liquidación del Anexo A. |
| 5 | Persistencia JSON con File System Access API y alternativa manual. | Ida y vuelta de todos los archivos de la sección 5. |
| 6 | Importación del Excel exportado, con el archivo real anonimizado. | Producir la estructura de la sección 4 desde un archivo real. |
| 7 | Generación del libro con ExcelJS (sección 11). | Abierto en Excel: fórmulas correctas, protección, validación, colores, impresión y valores de caché. |
| 8 | Interfaz (sección 14). | Flujo completo de un mes con datos sintéticos. |
| 9 | Importar el libro devuelto (sección 12). | Detecta emisión distinta, valores fuera de rango y totales alterados. |

Estructura de código sugerida:

```
src/
  motor/      tiempo.js  texto.js  clasificacion.js  novedades.js
              calculoDia.js  calculoMes.js  liquidacion.js  avisos.js
  datos/      persistencia.js  esquemas.js
  excel/      importarMensual.js  generarLibro.js  importarDevuelto.js
  ui/         (componentes Vue)
tests/        (una carpeta de pruebas por módulo, con datos sintéticos)
```

---

## 16. DATOS NECESARIOS PARA EL INFORME Y NO PARA EL CÁLCULO

`legajo`, `dni`, `concepto` y el nombre del grupo provienen de la configuración del agente y del grupo, porque el archivo exportado no los trae. Se usan para el libro y la resolución de pago.

---

## 17. CAMBIOS RESPECTO DE LA v4

1. Modelo de tres magnitudes: realizadas, autorizadas (tope) y computadas, más el excedente y las horas finales editables por el jefe.
2. Topes propios por agente para cada tipo de día; se eliminan los topes generales y el bloqueante `SIN_TOPE_CONFIGURADO`. Un tope no definido vale cero.
3. Se eliminan las autorizaciones excepcionales cargadas de antemano: la autorización la da el jefe editando el libro.
4. Domingo y sábado no habilitado: se muestra el tiempo realizado, se computa cero y el jefe decide.
5. Se agrega el informe: un libro mensual con hoja por agente, resumen, fórmulas, protección y validación (sección 11).
6. Se agregan datos de agente (legajo, DNI, concepto) y de grupo (nombre, horas máximas).
7. Importes enteros, redondeados hacia arriba por agente y mes (confirmado).
8. Umbral inclusivo de `00:50` (confirmado).
9. Tiempo fuera de la modalidad: se muestra, no se cuenta y no genera aviso (confirmado).
10. Se agrega la arquitectura, las fases y las reglas de trabajo para el asistente.
11. Queda fuera de esta versión el bloque de diferencias y arrastre entre meses.

---

## 17 bis. CAMBIOS RESPECTO DE LA v5 (v5.1)

1. Salida tras medianoche en la fila del día de ingreso.
2. Observaciones de desplegable.
3. Novedades sin alias.
4. `OBSERVACION_NO_RECONOCIDA` ante cualquier observación no vacía sin coincidencia.
5. `LIC. ANUAL ORDINARIA` prevalece sobre el tipo de día.
6. Casos 20 a 24 del Anexo A.
7. Con `LIC. ANUAL ORDINARIA`, `tope_lao_receso` prevalece sobre el `tope_especial` de un asueto o paro.

---

## 18. SUPUESTOS ADOPTADOS A CONFIRMAR

1. **Horas dobles:** se muestran como horas equivalentes (cada hora doble cuenta por dos) para mantener un único valor por hora en el resumen.
2. **Novedades:** solo modifican el cálculo en días `HABIL_NORMAL`, salvo la `LIC. ANUAL ORDINARIA`, que prevalece sobre el tipo de día (excepción confirmada): se informa como días corridos, fila por fila, y en feriado, sábado, domingo, asueto o paro se calcula con `tope_lao_receso` y factor 1.
3. **Paro:** se trata como asueto (factor simple, tope propio del agente para paros).
4. **Evento con tope especial:** prevalece sobre el tope del agente para esa fecha, salvo que el agente tenga `LIC. ANUAL ORDINARIA` ese día (prevalece `tope_lao_receso`).
5. **Sábado habilitado:** el tiempo fuera de la franja es no computable, sin aviso.
6. **Tope vacío:** vale `00:00`; la interfaz exige completar todos los topes.
7. **Reconocimiento de novedades:** por coincidencia de palabras completas dentro de la observación (confirmado).
8. **Segundos:** si el archivo trajera segundos, se truncan al minuto.
9. **Límite de autorización:** el jefe puede fijar horas finales entre cero y lo realizado, nunca más que lo realizado.
10. **Fechas bloqueadas:** se muestran en rojo y no editables; no se generan hojas de agentes sin configuración.

---

## ANEXO A. CASOS DE PRUEBA

Salvo indicación, el agente tiene: franja `08:00-14:30`, modalidad `DESPUES`, `tope_extra_habil = 04:00`, `tope_feriado = 04:00`, `tope_asueto = 04:00`, `tope_lao_receso = 08:00`, sábado no habilitado, umbral `00:50`.

### A.1. Cálculo diario

| # | Caso | Datos | Realizada | Autorizada | Computada | Excedente | Aviso |
|---|---|---|---|---|---|---|---|
| 1 | Hábil, después | 08:00-17:10 | 2:40 | 4:00 | 2:40 | 0:00 | ninguno |
| 2 | Hábil, antes (modalidad `ANTES`) | 07:05-14:30 | 0:55 | 4:00 | 0:55 | 0:00 | ninguno |
| 3 | Bajo el umbral | 08:00-15:15 | 0:45 | 4:00 | 0:00 | 0:45 | `BAJO_UMBRAL` |
| 4 | Umbral exacto | 08:00-15:20 | 0:50 | 4:00 | 0:50 | 0:00 | ninguno |
| 5 | Fuera de modalidad (`ANTES`) | 07:00-16:00 | 1:00 (no computable 1:30) | 4:00 | 1:00 | 0:00 | ninguno |
| 6 | Excede el tope | 08:00-21:30 | 7:00 | 4:00 | 4:00 | 3:00 | `EXCEDENTE_SOBRE_TOPE` |
| 7 | Permiso media jornada | 08:00-13:00 (exigible 3:30) | 1:30 | 4:00 | 1:30 | 0:00 | ninguno |
| 8 | Permiso, bajo umbral | trabajó 4:10 | 0:40 | 4:00 | 0:00 | 0:40 | `BAJO_UMBRAL` |
| 9 | Permiso, sin extra | trabajó 3:00 | 0:00 | 4:00 | 0:00 | 0:00 | ninguno |
| 10 | Feriado con exceso (factor 2) | trabajó 8:00 | 8:00 | 4:00 | 4:00 | 4:00 | `EXCEDENTE_SOBRE_TOPE` |
| 11 | Feriado sin tope definido (`tope_feriado = 00:00`) | trabajó 3:00 | 3:00 | 0:00 | 0:00 | 3:00 | `SIN_AUTORIZACION_DIA` |
| 12 | Domingo | trabajó 3:00 | 3:00 | 0:00 | 0:00 | 3:00 | `TRABAJO_DOMINGO_SIN_AUTORIZACION` |
| 13 | Sábado habilitado (franja 08:00-12:00, tope 4:00) | 08:00-13:00 | 4:00 (no computable 1:00) | 4:00 | 4:00 | 0:00 | ninguno |
| 14 | Sábado no habilitado | trabajó 3:00 | 3:00 | 0:00 | 0:00 | 3:00 | `TRABAJO_SABADO_NO_HABILITADO` |
| 15 | Licencia anual ordinaria con trabajo | novedad `LIC. ANUAL ORDINARIA` (día hábil); trabajó 5:00 | 5:00 | 8:00 | 5:00 | 0:00 | ninguno |
| 16 | Justificación común con marcaciones | `AUSENTE POR ENFERMEDAD`, 08:00-12:00 | 0:00 | 0:00 | 0:00 | 0:00 | `MARCACIONES_EN_DIA_JUSTIFICADO` |
| 17 | Cruce de medianoche | 22:00-01:30 | `Hs_Trab = 3:30` | | | | |
| 18 | Asueto con tope especial 02:00 | trabajó 3:00 | 3:00 | 2:00 | 2:00 | 1:00 | `EXCEDENTE_SOBRE_TOPE` |
| 19 | Dos novedades en la misma fecha | | | | | | bloqueante `NOVEDAD_DUPLICADA_EN_FECHA` |
| 20 | Licencia anual ordinaria en feriado (factor 1, no 2) | novedad `LIC. ANUAL ORDINARIA`; trabajó 5:00 | 5:00 | 8:00 | 5:00 | 0:00 | ninguno |
| 21 | Licencia anual ordinaria en sábado no habilitado | novedad `LIC. ANUAL ORDINARIA`; trabajó 3:00 | 3:00 | 8:00 | 3:00 | 0:00 | ninguno |
| 22 | Licencia anual ordinaria en domingo | novedad `LIC. ANUAL ORDINARIA`; trabajó 3:00 | 3:00 | 8:00 | 3:00 | 0:00 | ninguno |
| 23 | Licencia anual ordinaria en feriado con exceso (factor 1) | novedad `LIC. ANUAL ORDINARIA`; trabajó 9:00 | 9:00 | 8:00 | 8:00 | 1:00 | `EXCEDENTE_SOBRE_TOPE` |
| 24 | Licencia anual ordinaria en asueto con tope especial 02:00 (prevalece `tope_lao_receso`) | novedad `LIC. ANUAL ORDINARIA`; trabajó 3:00 | 3:00 | 8:00 | 3:00 | 0:00 | ninguno |

### A.2. Liquidación

| # | Datos | Resultado |
|---|---|---|
| L1 | 5:30 simples, valor hora 1234,50 | importe 6789,75, liquidado **6790** |
| L2 | 3:00 simples + 1:00 dobles, valor hora 4500 | 5:00 equivalentes, importe **22500** |
| L3 | 0:00 | importe 0 |
| L4 | 1 minuto, valor hora 100 | 1,67, liquidado **2** |

### A.3. Libro

| # | Verificación |
|---|---|
| B1 | Los totales están en `C5:C10` de cada hoja, para meses de 28, 30 y 31 días. |
| B2 | Cambiar `S` en una fila recalcula `C7:C10`, el `Resumen` y marca `T = "SÍ"`. |
| B3 | `S` rechaza valores mayores que `N` o negativos. |
| B4 | `S` está bloqueada en filas con `N = 0` y todo el resto de la hoja está protegido. |
| B5 | `Resumen!F` coincide con `C9` de cada hoja y `G` con `ROUNDUP` por agente. |
| B6 | El control de horas máximas avisa cuando el total las supera. |
| B7 | `Control` contiene `codigo_emision` y la configuración aplicada de cada agente. |

---

## ANEXO B. CATÁLOGOS INICIALES

### B.1. Justificaciones

Clase `COMPLETA` (`Jornada_Exigible = 00:00`, sin extras):

`RAZONES PARTICULARES`, `AUSENTE POR ENFERMEDAD`, `AUS. FAMILIAR ENFERMO`, `LIC. ADEUDADA`, `DUELO`, `DIA NODOCENTE`, `JUSTIF. POR DIRECTOR`, `A CTA. LIC.`, `LIC. LARGO TRATAMIENTO`, `TELETRABAJO`, `AUSENTE POR EXAMEN`, `AUSENTE COMPENSADO`, `HS. COMPENSADAS`, `DIAS A COMPENSAR`, `LIC. X ESTUDIO`, `LIC. GREMIAL`, `LIC. X MATERNIDAD`, `LIC. X MATRIMONIO`.

Clase `ESPECIAL_LAO_RECESO` (`Jornada_Exigible = 00:00`, permite extras por razones de servicio):

`LIC. ANUAL ORDINARIA`, `RECESO INVERNAL`.

### B.2. Permisos parciales

| Descripción | Jornada exigible |
|---|---|
| `PERMISO MEDIA JORNADA` | 03:30 |
| `P/EXCEPCIONAL A/86` | 02:00 |
