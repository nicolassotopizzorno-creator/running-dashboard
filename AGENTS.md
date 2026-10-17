# Ritmo: reglas para ChatGPT y agentes que actualizan este repositorio

El usuario carga sesiones enviando un TCX de Zepp y comentarios desde ChatGPT, normalmente en el celular. Su objetivo es no tocar código. Ejecutar las actualizaciones disponibles; no limitarse a dar instrucciones de programación.

## Flujo de cada carga

1. Leer README.md, este archivo y la última versión de data/workouts.json en GitHub. No usar una copia antigua del historial.
2. Extraer fecha local (America/Argentina/Buenos_Aires), tipo de sesión y contexto del mensaje. Distinguir running, gym y running_gym. No asumir que siempre hizo ambos.
3. Con TCX, usar scripts/import_tcx.py y un JSON temporal de contexto. El script usa solo Python estándar. Para enriquecer una fecha ya registrada, identificar la sesión y pasar --replace con el mismo ID. Varias sesiones en la misma fecha tienen IDs distintos.
4. Sin TCX, incorporar manualmente un registro con source=user_report y samples=[], o actualizar únicamente el contexto/tiempos. Para gym: running=null. Los datos ausentes son null, nunca cero.
5. Validar con node --test tests/metrics.test.mjs y python -m unittest discover -s tests -p test_*.py. Verificar fecha, distancia, duración, tipos y extremos de curvas.
6. Escribir workouts.json en GitHub leyendo antes el SHA vigente. Si hay conflicto, releer y reaplicar; nunca pisar sesiones nuevas. Hacer commit descriptivo. Si cambia solo el historial no modificar la web.
7. Verificar el commit y el despliegue de Pages. Confirmar al usuario qué sesión se incorporó y qué datos siguen pendientes. Nunca decir “actualizado en GitHub” si solo generaste un archivo local.

## Fuentes y semántica

- Velocidad e inclinación: manda el usuario/cinta. Nunca reemplazarlas por velocidad del reloj, GPS o distancia/tiempo. Los rangos no son medias ni velocidades sostenidas. No inferir una media exacta con tramos incompletos.
- Distancia: suma de DistanceMeters de los Lap del TCX calibrado. Respetar calibración previa de Zepp. Si hay dudas del formato, detener la interpretación del campo y revisarlo.
- FC/cadencia/curvas: TCX. Preservar resúmenes informados cuando faltan campos en el TCX; no etiquetarlos falsamente como mediciones importadas.
- Cadencia: comprobar unidades de Zepp antes de pasar --cadence-factor 1 (pasos/min) o 2 (ciclos/min). Mantener valor crudo. No adivinar la unidad por el número. Cadence de ciclismo no equivale necesariamente a running.
- Zancada: aquí strideM significa metros por paso. El importador conservador deja null si no hay un campo con unidad verificada; si el TCX lo incluye, adaptar el importador con pruebas. No inventar curva ni derivar de promedios.
- durationSec es tiempo de running del resumen. elapsedSec incluye el eje temporal real y pausas; puede ser mayor. Gráficos: eje desde 0 hasta elapsedSec, preservar SIEMPRE la última muestra exacta al reducir cada 5–10 s. No recortar con un redondeo al múltiplo de 5. No extender valores inventados: ausencia final = null y nota.
- session.totalDurationSec comprende toda la sesión, NO sumar running otra vez. gymDurationSec solo cuando informado explícitamente; el resto del total puede incluir pausas, transiciones o vestuario.
- “Cumplí con las medidas”: aplicar data.reference: inclinación 0,5 %, km 1 a 10,5; km 2 a 11; km 3 a 11,5 km/h. No asumir velocidad de distancia adicional. No cambiar la referencia o meta automáticamente.
- No convertir variaciones pequeñas de FC/cadencia/zancada en mejoras fisiológicas. Incluir calor, fatiga, sensación y cambios de carga. Meta: 3 km en 15:00 / 12 km/h sostenidos, no un pico instantáneo.
- No guardar TCX crudos con GPS u otros metadatos personales por defecto. Se extraen solo los campos necesarios. Nunca poner credenciales en JS, JSON ni commits.

## Contexto para el importador

```json
{
  "id": "2026-10-18-01",
  "date": "2026-10-18",
  "type": "running_gym",
  "referenceApplied": true,
  "session": {"totalDurationSec": 5400, "gymDurationSec": null},
  "context": {"temperature": "Fresco", "sensations": "Cómodo", "notes": "Comentario del usuario"}
}
```

Para gimnasio sin running escribir un registro con running=null, session.gymDurationSec y/o totalDurationSec, context e id únicos. No pasar una sesión de gimnasio por el importador de running.

Si ChatGPT en el dispositivo actual no ofrece herramientas de escritura a GitHub, explicarlo. Preparar el archivo actualizado como alternativa sin afirmar que la conexión de lectura basta para guardar. La disponibilidad del conector depende del entorno, no del dashboard.
