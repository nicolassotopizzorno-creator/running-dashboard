# RITMO · Running + gym

Dashboard personal mobile-first, sin dependencias ni instalación. HTML, CSS, JS modular y `data/workouts.json` como única fuente de datos. Objetivo: 3 km en 15:00 a 12 km/h sostenidos.

Dashboard: https://nicolassotopizzorno-creator.github.io/running-dashboard/

## Uso desde el celular

Abrí la URL publicada del dashboard. Para actualizar, adjuntá a ChatGPT el TCX de Zepp y tus comentarios, e indicá este repositorio. Texto sugerido:

> Actualizá mi dashboard en nicolassotopizzorno-creator/running-dashboard. Leé AGENTS.md y el historial actual. Adjunto el TCX de hoy. Cumplí con las medidas. Sensaciones: … Temperatura: … Tiempo total de sesión: … Guardá la sesión en data/workouts.json sin duplicarla y verificá el commit.

No necesitás editar código. La escritura directa depende de que esa sesión de ChatGPT tenga herramientas de escritura y acceso al repositorio; conectar GitHub en una sesión de lectura no garantiza poder hacer commits. Si no las tiene, ChatGPT debe entregar el JSON actualizado e indicar claramente que la publicación está pendiente. No se almacenan claves ni tokens en el sitio.

## Incluye

- Cuatro indicadores en una fila incluso a 320 px.
- Evolución por fecha: rango informado de velocidad de cinta, FC media, cadencia y longitud de paso; meta de 12 km/h.
- Tiempo de sesión con estados explícitos de datos pendientes.
- Comparación entre las últimas dos corridas con contexto, sin diagnósticos automáticos.
- Referencia y detalle diario inicialmente plegados. Cuatro curvas con eje completo cuando se importan TCX.
- Importador Python conservador, sin dependencias; última muestra y duración real preservadas.
- Historial inicial del 16 y 17/10/2026. Las curvas y la zancada están pendientes de TCX; duración total del 17/10 pendiente.

## Estructura

`index.html`, `styles.css`, `app.js`, `metrics.js`, `icon.svg`: sitio. `data/workouts.json`: datos. `scripts/import_tcx.py`: importación. `AGENTS.md`: instrucciones para próximas cargas. `tests/`: pruebas de métricas/importación.

## Desarrollo / verificación (para el agente)

```sh
npm start
node --test tests/metrics.test.mjs
python -m unittest discover -s tests -p "test_*.py"
python scripts/import_tcx.py actividad.tcx contexto.json --replace
```

El servidor imprime su URL local; no es accesible desde el celular. La URL de GitHub Pages sí funciona sin mantener la PC encendida. Para Pages, publicar la rama main desde la raíz; `.nojekyll` evita procesamiento de Jekyll.

## Modelo de datos

Todas las duraciones en segundos, distancia en km, FC en lpm, cadencia en pasos/min, longitud de paso en metros/paso. Fechas locales ISO. Un ID por sesión; puede haber varias el mismo día. Nulos indican pendientes. `samples` contiene objetos `{t, paceSecKm, heartRate, cadence, strideM}`; `t` es tiempo transcurrido en segundos desde inicio real.

Los rangos de cinta son los extremos informados, no medias. El mejor ritmo es el menor `durationSec / distanceKm` de una sesión completa; no implica haber logrado la meta 3K. Las sesiones iniciales fueron informadas por el usuario a partir del reloj; no se recibieron todavía los TCX originales. No hay curvas simuladas.

La publicación estática expone el JSON a quien pueda acceder al sitio. No existe login implementado en esta web. La visibilidad del repositorio y la de Pages deben elegirse conscientemente; un repositorio privado no garantiza un Pages privado.
