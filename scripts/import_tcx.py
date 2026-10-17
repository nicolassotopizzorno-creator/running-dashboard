"""TCX + contexto -> workouts.json. Solo biblioteca estándar; sin servicios externos.

Uso para ChatGPT/agentes: python scripts/import_tcx.py actividad.tcx contexto.json
El contexto debe traer id, date, type y opcionalmente treadmill/session/context.
"""
import argparse
import copy
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET


def local(tag):
    return tag.rsplit('}', 1)[-1]


def child(el, name):
    return next((x for x in el if local(x.tag) == name), None)


def number(el, name):
    node = child(el, name)
    if node is None or node.text is None:
        return None
    try:
        value = float(node.text)
        return value if math.isfinite(value) else None
    except ValueError:
        return None


def bpm(el, name):
    node = child(el, name)
    return number(node, 'Value') if node is not None else None


def timestamp(value):
    result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('El TCX tiene horas sin zona horaria; hay que revisarlas.')
    return result


def downsample(points, step=5):
    """Conservar muestras reales, extremos, huecos y SIEMPRE el último punto."""
    if len(points) < 3:
        return points
    kept = [points[0]]
    keys = ('heartRate', 'cadence', 'paceSecKm', 'strideM')
    for i, p in enumerate(points[1:-1], 1):
        gap_edge = any((p.get(k) is None) != (points[i-1].get(k) is None)
                       or (p.get(k) is None) != (points[i+1].get(k) is None) for k in keys)
        if p['t']-kept[-1]['t'] >= step or gap_edge:
            kept.append(p)
    kept.append(points[-1])
    return kept


def parse_tcx(raw, cadence_factor=None):
    # No aceptar DTD/entidades del archivo adjunto.
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('TCX con DTD o entidades no admitido.')
    root = ET.fromstring(raw)
    activities = [x for x in root.iter() if local(x.tag) == 'Activity']
    if len(activities) != 1:
        raise ValueError('Se espera exactamente una actividad por TCX.')
    activity = activities[0]
    laps = [x for x in activity if local(x.tag) == 'Lap']
    duration_values = [number(l, 'TotalTimeSeconds') for l in laps]
    distance_values = [number(l, 'DistanceMeters') for l in laps]
    if not laps or any(x is None or x < 0 for x in duration_values+distance_values):
        raise ValueError('Faltan resúmenes de vuelta válidos; no se inferirá distancia calibrada.')
    duration = sum(duration_values)
    distance = sum(distance_values)/1000
    if duration <= 0 or distance <= 0:
        raise ValueError('Distancia y tiempo deben ser positivos.')
    starts = [timestamp(l.attrib['StartTime']) for l in laps if 'StartTime' in l.attrib]
    identity = child(activity, 'Id')
    if identity is not None and identity.text:
        starts.append(timestamp(identity.text))
    trackpoints = []
    for track in (x for x in activity.iter() if local(x.tag) == 'Track'):
        for p in track:
            if local(p.tag) != 'Trackpoint':
                continue
            time = child(p, 'Time')
            if time is None or not time.text:
                raise ValueError('Hay una muestra sin tiempo; se requiere revisión.')
            trackpoints.append((timestamp(time.text), p, id(track)))
    starts += [t for t, _, _ in trackpoints]
    if not starts:
        raise ValueError('No hay hora de inicio válida.')
    start = min(starts)
    lap_ends = [(timestamp(l.attrib['StartTime'])-start).total_seconds()+number(l,'TotalTimeSeconds')
                for l in laps if 'StartTime' in l.attrib]
    samples, warnings = [], []
    previous = None
    for instant, p, track_id in sorted(trackpoints, key=lambda x: x[0]):
        t = round((instant-start).total_seconds(), 3)
        ext = {local(x.tag): x for x in p.iter() if x is not p}
        def extnum(name):
            try:
                v = float(ext[name].text)
                return v if math.isfinite(v) else None
            except (KeyError, TypeError, ValueError):
                return None
        speed = extnum('Speed')
        meters = number(p, 'DistanceMeters')
        if speed is None and previous and previous['track'] == track_id and meters is not None and previous['meters'] is not None:
            delta_t = t-previous['t']
            delta_d = meters-previous['meters']
            if 0 < delta_t <= 15 and delta_d >= 0:
                speed = delta_d/delta_t
        raw_cadence = extnum('RunCadence')
        if raw_cadence is None:
            raw_cadence = number(p, 'Cadence')
        # La unidad de Zepp debe verificarse con el primer archivo, no adivinarse.
        cadence = raw_cadence*cadence_factor if raw_cadence is not None and cadence_factor else None
        sample = {'t':t, 'heartRate':bpm(p,'HeartRateBpm'), 'cadence':cadence,
                  'rawCadence':raw_cadence, 'paceSecKm':1000/speed if speed and speed > 0 else None,
                  'strideM':None}
        if previous and (t-previous['t'] > 15 or previous['track'] != track_id):
            samples.append({'t':round(previous['t']+.001,3),'heartRate':None,'cadence':None,'paceSecKm':None,'strideM':None})
        if samples and samples[-1]['t'] == t:
            samples[-1] = sample
        else:
            samples.append(sample)
        previous = {'t':t,'meters':meters,'track':track_id}
    elapsed = max([duration]+lap_ends+[p['t'] for p in samples])
    actual_last = samples[-1]['t'] if samples else None
    # El eje llega al fin real, pero una ausencia no se rellena con datos inventados.
    if samples and samples[0]['t'] > 0:
        samples.insert(0, {'t':0,'heartRate':None,'cadence':None,'paceSecKm':None,'strideM':None})
    if not samples or samples[-1]['t'] < elapsed:
        samples.append({'t':round(elapsed,3),'heartRate':None,'cadence':None,'paceSecKm':None,'strideM':None})
        warnings.append('El final declarado no tiene muestra; se conserva un punto nulo en el extremo.')
    if cadence_factor is None:
        warnings.append('Cadencia sin convertir: confirmar si el TCX usa pasos o ciclos por minuto.')
    warnings.append('Zancada pendiente: no se deriva de velocidad/cadencia ni se asumen unidades de extensiones.')
    hr_values = [(bpm(l,'AverageHeartRateBpm'),number(l,'TotalTimeSeconds')) for l in laps]
    average = sum(v*t for v,t in hr_values)/duration if all(v is not None for v,t in hr_values) else None
    maxima = [bpm(l,'MaximumHeartRateBpm') for l in laps]
    max_hr = max(maxima) if maxima and all(v is not None for v in maxima) else max((p['heartRate'] for p in samples if p.get('heartRate') is not None),default=None)
    return {'distanceKm':distance,'durationSec':duration,'elapsedSec':elapsed,
            'distanceSource':'tcx_calibrated','heartRateAvg':average,'heartRateMax':max_hr,
            'cadenceAvg':None,'cadenceApproximate':False,'strideAvgM':None,
            'samples':downsample(samples),'lastRecordedSampleSec':actual_last,
            'tcxSha256':hashlib.sha256(raw).hexdigest(),'importWarnings':warnings}


def merge_workout(db, parsed, context, replace=False):
    result = copy.deepcopy(db)
    for key in ('id','date','type'):
        if not context.get(key):
            raise ValueError('Falta contexto: '+key)
    dt.date.fromisoformat(context['date'])
    if context['type'] not in ('running','running_gym'):
        raise ValueError('Para importar TCX se requiere running o running_gym.')
    existing = next((w for w in result['workouts'] if w['id'] == context['id']), None)
    duplicate = next((w for w in result['workouts'] if w.get('running',{}).get('tcxSha256') == parsed['tcxSha256']), None)
    if duplicate and duplicate['id'] != context['id']:
        raise ValueError('Este TCX ya está cargado en otra sesión.')
    if existing and not replace:
        raise ValueError('La sesión existe. Usar --replace para enriquecerla sin duplicarla.')
    w = copy.deepcopy(existing) if existing else {'session':{},'context':{},'running':{}}
    old_running = w['running']
    # Mantener resúmenes informados si el TCX no los trae.
    for key in ('heartRateAvg','heartRateMax','cadenceAvg','strideAvgM'):
        if parsed[key] is None and old_running.get(key) is not None:
            parsed[key] = old_running[key]
            if key == 'cadenceAvg':
                parsed['cadenceApproximate'] = old_running.get('cadenceApproximate',False)
    treadmill = context.get('treadmill',old_running.get('treadmill',{}))
    if context.get('referenceApplied'):
        ref=result['reference']
        speeds=[s['speedKmh'] for s in ref['segments']]
        treadmill={'inclinePct':ref['inclinePct'],'segments':copy.deepcopy(ref['segments']),
                   'speedMinKmh':min(speeds),'speedMaxKmh':max(speeds),'averageSpeedKmh':None,
                   'approximate':False,'notes':'Cumplí con las medidas: '+ '; '.join(f"km {s['toKm']}: {s['speedKmh']} km/h" for s in ref['segments'])+'. Tramos adicionales sin velocidad informada.'}
    parsed['treadmill']=treadmill
    w.update({'id':context['id'],'date':context['date'],'type':context['type'],'source':'tcx','running':parsed})
    w['session'].update(context.get('session',{}))
    w['context'].update(context.get('context',{}))
    total=w['session'].get('totalDurationSec')
    if total is not None and total < parsed['durationSec']:
        raise ValueError('Duración total menor que running; revisar contexto.')
    if existing:
        result['workouts'][result['workouts'].index(existing)]=w
    else:
        result['workouts'].append(w)
    result['workouts'].sort(key=lambda w:(w['date'],w['id']))
    result['updatedAt']=dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tcx',type=Path)
    parser.add_argument('context',type=Path)
    parser.add_argument('--data',type=Path,default=Path(__file__).resolve().parents[1]/'data/workouts.json')
    parser.add_argument('--cadence-factor',type=int,choices=(1,2),default=None)
    parser.add_argument('--replace',action='store_true')
    args=parser.parse_args()
    parsed=parse_tcx(args.tcx.read_bytes(),args.cadence_factor)
    result=merge_workout(json.loads(args.data.read_text('utf-8-sig')),parsed,json.loads(args.context.read_text('utf-8-sig')),args.replace)
    serialized=json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
    tmp=args.data.with_suffix('.json.tmp')
    tmp.write_text(serialized,encoding='utf-8')
    tmp.replace(args.data)
    print(f"Historial actualizado. Última muestra real: {parsed['lastRecordedSampleSec']}; eje completo: {parsed['elapsedSec']} s.")
    for warning in parsed['importWarnings']:
        print('Revisar:',warning)


if __name__=='__main__':
    main()
