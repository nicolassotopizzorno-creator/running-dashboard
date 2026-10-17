export const finite = v => typeof v === 'number' && Number.isFinite(v);
export function pace(r) { return r && r.distanceKm > 0 && r.durationSec > 0 ? r.durationSec / r.distanceKm : null; }
export function clock(s) { if (!finite(s)) return '—'; const n = Math.round(s); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; }
export function duration(s) { if (!finite(s)) return 'Pendiente'; const minutes = Math.round(s/60); return minutes >= 60 ? `${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')} min` : `${minutes} min`; }
export function sessionTotal(w) { if (finite(w.session?.totalDurationSec)) return w.session.totalDurationSec; if(w.type === 'running') return w.running?.durationSec ?? null; if(w.type === 'gym') return w.session?.gymDurationSec ?? null; if(finite(w.running?.durationSec) && finite(w.session?.gymDurationSec)) return w.running.durationSec + w.session.gymDurationSec; return null; }
export function validate(data) {
 if(data.schemaVersion !== 1 || !Array.isArray(data.workouts)) throw new Error('Formato de historial no compatible.');
 const ids = new Set();
 for(const w of data.workouts) {
  if(!w.id || ids.has(w.id)) throw new Error('ID de sesión ausente o duplicado.'); ids.add(w.id);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(w.date) || !['running','running_gym','gym'].includes(w.type)) throw new Error('Fecha o tipo de sesión inválido.');
  if(w.type !== 'gym' && (!w.running || !(w.running.distanceKm > 0) || !(w.running.durationSec > 0))) throw new Error('Running requiere distancia y duración positivas.');
  for(const v of [w.session?.totalDurationSec,w.session?.gymDurationSec]) if(v != null && (!finite(v) || v < 0)) throw new Error('Duración inválida.');
  const total = sessionTotal(w); if(w.running && finite(total) && total < w.running.durationSec) throw new Error('La sesión total no puede durar menos que la corrida.');
  let last=-1; for(const p of w.running?.samples ?? []) { if(!finite(p.t) || p.t < last || p.t < 0 || p.t > (w.running.elapsedSec ?? w.running.durationSec)+.01) throw new Error('Curva fuera de orden o duración.'); last=p.t; }
 }
 return data;
}
