import { finite, pace, clock, duration, sessionTotal, validate } from './metrics.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (v,d=1) => finite(v) ? v.toLocaleString('es-AR',{maximumFractionDigits:d,minimumFractionDigits:d}) : '—';
const shortDate = d => `${d.slice(8,10)}/${d.slice(5,7)}`;
const fullDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'});
const types = {running:'Solo running',gym:'Solo gimnasio',running_gym:'Running + gimnasio'};
const colors = {speed:'#ff8055',heartRate:'#75c8f5',cadence:'#b29aff',stride:'#b2e987'};
let data, workouts, runs;
const empty = text => `<div class="empty"><b>∿</b>${esc(text)}</div>`;
function lineChart({points, xMax, xMin=0, xTicks, unit, color, goal=null, time=false, yFormat=null}) {
 const W=500,H=228,L=44,R=24,T=28,B=36,pw=W-L-R,ph=H-T-B;
 const vals=points.flatMap(p => [p.y,p.high]).filter(finite); if(goal!==null) vals.push(goal);
 if(!vals.length) return empty('Todavía no hay datos de esta métrica');
 const lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.3,hi>50?3:.25),min=Math.max(0,lo-pad),max=hi+pad;
 const x = v => L + (v-xMin)/((xMax-xMin)||1)*pw; const y = v => T+ph-(v-min)/(max-min)*ph;
 const fmt = yFormat ?? (v=>num(v,hi>50?0:1));
 let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unit)} por ${time?'tiempo de corrida':'fecha'}"><title>${esc(unit)}. ${points.map(p=>`${esc(p.label??clock(p.x))}: ${finite(p.y)?esc(fmt(p.y)):'sin dato'}${finite(p.high)?' a '+esc(fmt(p.high)):''}`).join('; ')}</title>`;
 for(let i=0;i<4;i++){const v=min+(max-min)*i/3;s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#303238" stroke-dasharray="3 5"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${esc(fmt(v))}</text>`;}
 s+=`<text x="${L}" y="12">${esc(unit)}</text>`;
 if(goal!==null)s+=`<line x1="${L}" x2="${W-R}" y1="${y(goal)}" y2="${y(goal)}" stroke="#b2e987" stroke-dasharray="6 5"/><text class="goal-label" x="${W-R}" y="${y(goal)-8}" text-anchor="end">META ${esc(num(goal,0))} km/h</text>`;
 let path='',upper='';let active=false,highActive=false;
 for(const p of points){if(finite(p.y)){path+=`${active?'L':'M'}${x(p.x)},${y(p.y)} `;active=true;}else active=false;if(finite(p.high)){upper+=`${highActive?'L':'M'}${x(p.x)},${y(p.high)} `;highActive=true;}else highActive=false;}
 s+=`<path d="${path}" stroke="${color}" stroke-width="2.5" fill="none"/><path d="${upper}" stroke="${color}" stroke-opacity=".5" stroke-dasharray="4 4" stroke-width="2" fill="none"/>`;
 for(const p of points){if(!finite(p.y))continue;if(finite(p.high))s+=`<line x1="${x(p.x)}" x2="${x(p.x)}" y1="${y(p.y)}" y2="${y(p.high)}" stroke="${color}" stroke-width="10" opacity=".2"/><circle cx="${x(p.x)}" cy="${y(p.high)}" r="4" fill="${color}"/>`;if(!time)s+=`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="4.5" fill="${color}" stroke="#191b20" stroke-width="2"><title>${esc(p.label)}: ${esc(fmt(p.y))}${finite(p.high)?' – '+esc(fmt(p.high)):''} ${esc(unit)}</title></circle>`;}
 for(const [i,tick] of xTicks.entries())s+=`<text x="${x(tick.x)}" y="${H-9}" text-anchor="${i===0?'start':i===xTicks.length-1?'end':'middle'}">${esc(tick.label)}</text>`;
 return s+'</svg>';
}
function evolution(metric='speed') {
 const config={speed:{unit:'km/h · rango de cinta',note:'Extremos del rango informado en la cinta; no representan una velocidad media. La línea verde marca tu objetivo.'},heartRate:{unit:'lpm · FC media',note:'Menos pulsaciones pueden acompañar menor calor o esfuerzo. Compará también el contexto.'},cadence:{unit:'spm · cadencia media',note:'Las dos sesiones iniciales tienen cadencia aproximada informada por el usuario.'},stride:{unit:'m/paso · longitud media',note:'Sin datos de zancada todavía. No se estima a partir de promedios.'}}[metric];
 const points = runs.map(w=>({x:Date.parse(w.date+'T12:00:00Z'),y:metric==='speed'?w.running.treadmill?.speedMinKmh:metric==='heartRate'?w.running.heartRateAvg:metric==='cadence'?w.running.cadenceAvg:w.running.strideAvgM,high:metric==='speed'?w.running.treadmill?.speedMaxKmh:null,label:shortDate(w.date)}));
 const bounds=points.map(p=>p.x);let xMin=bounds[0]??0,xMax=bounds.at(-1)??1;if(xMin===xMax){xMin-=43200000;xMax+=43200000;}
 const ticks=points.filter((_,i)=>points.length<=5||i===0||i===points.length-1||i%Math.ceil(points.length/4)===0).map(p=>({x:p.x,label:p.label}));
 $('#evolution').innerHTML=lineChart({points,xMin,xMax,xTicks:ticks,unit:config.unit,color:colors[metric],goal:metric==='speed'?data.goal.speedKmh:null});$('#evolution-note').textContent=config.note;
}
function durations(){
 if(!workouts.length){$('#duration').innerHTML=empty('Todavía no hay sesiones');return;}
 const recent=workouts.slice(-8),max=Math.max(1800,...recent.map(w=>sessionTotal(w)??w.running?.durationSec??0));
 let s='<svg viewBox="0 0 460 228" role="img" aria-label="Tiempo por sesión; las barras incompletas indican total pendiente"><title>Tiempo total: '+recent.map(w=>esc(shortDate(w.date)+' '+duration(sessionTotal(w)))).join('; ')+'</title>';
 const L=40,R=12,T=30,H=158,pw=460-L-R; for(let i=0;i<4;i++){const v=max*i/3,y=T+H-v/max*H;s+=`<line x1="${L}" x2="448" y1="${y}" y2="${y}" stroke="#303238" stroke-dasharray="3 5"/><text x="32" y="${y+4}" text-anchor="end">${Math.round(v/60)}</text>`;}s+='<text x="40" y="12">minutos</text>';
 recent.forEach((w,i)=>{const total=sessionTotal(w),run=w.running?.durationSec??0,rest=finite(total)?Math.max(0,total-run):0,x=L+pw*(i+.5)/recent.length,bw=Math.min(50,pw/recent.length*.55),rh=run/max*H,gh=rest/max*H;
 s+=`<rect x="${x-bw/2}" y="${T+H-rh}" width="${bw}" height="${rh}" rx="3" fill="#ff8055"/><rect x="${x-bw/2}" y="${T+H-rh-gh}" width="${bw}" height="${gh}" rx="3" fill="#b29aff"/><text x="${x}" y="${Math.max(14,T+H-rh-gh-10)}" text-anchor="middle" class="value-label">${finite(total)?esc(duration(total)):'?'}</text><text x="${x}" y="210" text-anchor="middle">${shortDate(w.date)}</text>`;});
 s+='</svg>';const pending=recent.filter(w=>sessionTotal(w)===null);$('#duration').innerHTML=s+(pending.length?`<div class="range-note">${pending.map(w=>esc(shortDate(w.date))).join(', ')}: total pendiente; solo se muestra el tiempo conocido.</div>`:'');
}
function comparison(){
 const current=runs.at(-1),prev=runs.at(-2);if(!current||!prev){$('#comparison').innerHTML=empty('Se necesitan dos corridas para comparar');return;}
 $('#compare-dates').textContent=`${shortDate(current.date)} ← ${shortDate(prev.date)}`;
 const a=current.running,b=prev.running;
 const delta=(label,now,before,unit,kind='neutral',dec=0)=>{const ok=finite(now)&&finite(before),d=ok?now-before:null;return `<div class="delta"><small>${label}</small><strong class="${kind}">${ok?(d>0?'↑ +':d<0?'↓ −':'→ ')+num(Math.abs(d),dec):'—'} <small>${unit}</small></strong><p>${ok?`${num(before,dec)} → ${num(now,dec)} ${unit}`:'Pendiente de datos comparables'}</p></div>`;};
 const ar=a.treadmill,br=b.treadmill;
 $('#comparison').innerHTML=delta('Cinta · extremo superior',ar?.speedMaxKmh,br?.speedMaxKmh,'km/h','faster',1)+delta('Frecuencia cardíaca media',a.heartRateAvg,b.heartRateAvg,'lpm')+delta('Cadencia media'+(a.cadenceApproximate||b.cadenceApproximate?' ≈':''),a.cadenceAvg,b.cadenceAvg,'spm','change')+delta('Longitud de paso',a.strideAvgM,b.strideAvgM,'m','change',2);
 $('#context').textContent=`${shortDate(prev.date)}: ${prev.context?.temperature??'temperatura no informada'}. ${shortDate(current.date)}: ${current.context?.temperature??'temperatura no informada'}; ${current.context?.sensations??'sensaciones no informadas'}. Los cambios describen estas sesiones; por sí solos no demuestran una mejora fisiológica. El extremo superior de cinta no equivale a velocidad sostenida.`;
}
function detail(id){const w=workouts.find(w=>w.id===id);if(!w)return;$('#day-title').textContent=fullDate(w.date);const r=w.running;
 const fact=(name,value)=>`<div><small>${esc(name)}</small><strong>${esc(value)}</strong></div>`;
 $('#day-summary').innerHTML=`<span class="badge">${types[w.type]} · ${w.source==='tcx'?'TCX + contexto':'Resumen informado · TCX pendiente'}</span><div class="day-facts">${r?fact('Distancia calibrada',num(r.distanceKm,2)+' km')+fact('Tiempo running',clock(r.durationSec))+fact('Ritmo medio',clock(pace(r))+' /km')+fact('Inclinación cinta',finite(r.treadmill?.inclinePct)?num(r.treadmill.inclinePct)+' %':'Pendiente')+fact('FC media / máxima',`${num(r.heartRateAvg,0)} / ${num(r.heartRateMax,0)} lpm`)+fact('Cadencia media',(r.cadenceApproximate?'≈ ':'')+num(r.cadenceAvg,0)+' spm'):''}${fact('Total de sesión',duration(sessionTotal(w)))}${fact('Gimnasio (por separado)',duration(w.session?.gymDurationSec))}</div>`;
 const charts=[['Ritmo','paceSecKm','min/km','#ff8055'],['Frecuencia cardíaca','heartRate','lpm','#75c8f5'],['Cadencia','cadence','spm','#b29aff'],['Longitud de paso','strideM','m/paso','#b2e987']];
 $('#day-charts').innerHTML=r?charts.map(([title,key,unit,color])=>{const end=r.elapsedSec??r.durationSec,points=(r.samples??[]).map(s=>({x:s.t,y:s[key]})),valid=points.some(p=>finite(p.y));const ticks=[0,end/2,end].map(x=>({x,label:clock(x)}));return `<article class="detail-chart"><h3>${title}</h3><div class="chart">${valid?lineChart({points,xMax:end,xTicks:ticks,unit,color,time:true,yFormat:key==='paceSecKm'?clock:null}):empty('Sin curva disponible · esperando datos del TCX')}</div><p class="chart-note">${valid?'Eje completo: 0:00 → '+clock(end)+'. Los huecos son datos ausentes.':'Se incorporará la curva real, sin recrearla desde promedios.'}</p></article>`;}).join(''):'';
 $('#day-context').innerHTML=`${r?'<h3 class="context-title">Velocidades reales de la cinta</h3><p>'+esc(r.treadmill?.notes||'No informadas')+'</p>':''}<h3 class="context-title">Contexto y sensaciones</h3><p>${esc(w.context?.temperature||'Temperatura no informada')} · ${esc(w.context?.sensations||'Sensaciones no informadas')}</p><p class="muted">${esc(w.context?.notes||'')}</p>${w.session?.startLocal?'<p>Sesión completa: '+esc(w.session.startLocal)+' → '+esc(w.session.endLocal)+'</p>':''}`;
}
async function init(){try{const res=await fetch('./data/workouts.json',{cache:'no-store'});if(!res.ok)throw new Error('No se pudo leer el historial.');data=validate(await res.json());workouts=[...data.workouts].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));runs=workouts.filter(w=>w.running);$('#sessions').textContent=workouts.length;$('#distance').textContent=num(runs.reduce((s,w)=>s+w.running.distanceKm,0),2);const p=runs.map(w=>pace(w.running)).filter(finite);$('#pace').textContent=p.length?clock(Math.min(...p)):'—';$('#updated').textContent='Actualizado '+shortDate(data.updatedAt);$('#status').textContent='';$('#status').hidden=true;evolution();durations();comparison();const ref=data.reference;$('#reference-content').innerHTML=`<p>Referencia: ${esc(shortDate(workouts.find(w=>w.id===ref.workoutId)?.date??''))}. Al decir “cumplí con las medidas”, se aplican estos parámetros:</p><div class="reference-parts"><span>Inclinación <b>${num(ref.inclinePct)} %</b></span>${ref.segments.map(s=>`<span>Km ${s.toKm} <b>${num(s.speedKmh)} km/h</b></span>`).join('')}</div>`;$('#date-select').innerHTML=[...workouts].reverse().map(w=>`<option value="${esc(w.id)}">${esc(fullDate(w.date))} · ${types[w.type]}${workouts.filter(a=>a.date===w.date).length>1?' · '+esc(w.id):''}</option>`).join('');$('#date-select').addEventListener('change',e=>detail(e.target.value));if(workouts.length)detail(workouts.at(-1).id);document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-metric]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));evolution(b.dataset.metric);}));}catch(e){$('#status').hidden=false;$('#status').textContent='No pudimos cargar los datos. '+e.message;}}
init();
