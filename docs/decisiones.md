# Decisiones técnicas de implementación

Estas notas son decisiones de implementación, no reglas de negocio.
Las reglas de negocio viven solo en docs/especificacion-v5.md.

- Fase 1: la Ñ se convierte en N al normalizar texto (NFD y eliminación de \p{M}). Confirmado por el usuario: no hay riesgo de choque.
- Fase 1: parsearHora y parsearDuracion son estrictas: no recortan espacios y devuelven null ante formato inválido; parsearDuracion no admite segundos.
- Fase 1: duracionPar e intervaloDePar lanzan RangeError si los minutos no son enteros entre 0 y 1439; quien las llame debe descartar antes los null de parsearHora.
- Fase 1: solapamiento devuelve 0 si el tramo común no es positivo, incluso con intervalos invertidos.
