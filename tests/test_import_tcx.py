import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('import_tcx',Path(__file__).resolve().parents[1]/'scripts/import_tcx.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def tcx(end=17,declared=17):
    points=''.join(f'<Trackpoint><Time>2026-10-17T13:00:{s:02d}Z</Time><DistanceMeters>{s*3}</DistanceMeters><HeartRateBpm><Value>{140+s}</Value></HeartRateBpm><Cadence>72</Cadence></Trackpoint>' for s in range(end+1))
    return f'<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2026-10-17T13:00:00Z</Id><Lap StartTime="2026-10-17T13:00:00Z"><TotalTimeSeconds>{declared}</TotalTimeSeconds><DistanceMeters>55</DistanceMeters><AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>157</Value></MaximumHeartRateBpm><Track>{points}</Track></Lap></Activity></Activities></TrainingCenterDatabase>'.encode()

class ImportTests(unittest.TestCase):
    def test_final_second_not_divisible_by_five(self):
        r=m.parse_tcx(tcx(),2)
        self.assertEqual(r['samples'][-1]['t'],17)
        self.assertEqual(r['samples'][-1]['heartRate'],157)
        self.assertEqual(r['samples'][-1]['cadence'],144)
        self.assertEqual(r['cadenceAvg'],144)
        self.assertEqual(r['distanceKm'],.055)
        self.assertIsNone(r['strideAvgM'])
    def test_missing_endpoint_is_null_not_extrapolated(self):
        r=m.parse_tcx(tcx(14,17))
        self.assertEqual(r['samples'][-1]['t'],17)
        self.assertIsNone(r['samples'][-1]['heartRate'])
        self.assertEqual(r['lastRecordedSampleSec'],14)
    def test_elapsed_longer_than_declared(self):
        r=m.parse_tcx(tcx(19,17))
        self.assertEqual(r['durationSec'],17)
        self.assertEqual(r['elapsedSec'],19)
        self.assertEqual(r['samples'][-1]['t'],19)
    def test_no_guessing_cadence_units(self):
        r=m.parse_tcx(tcx())
        self.assertIsNone(r['samples'][0]['cadence'])
        self.assertEqual(r['samples'][0]['rawCadence'],72)
    def test_duplicate_and_merge_preserves_context(self):
        db={'workouts':[]}
        ctx={'id':'2026-10-17-01','date':'2026-10-17','type':'running','treadmill':{'inclinePct':.5},'context':{'sensations':'Bien'}}
        d=m.merge_workout(db,m.parse_tcx(tcx()),ctx)
        with self.assertRaises(ValueError):m.merge_workout(d,m.parse_tcx(tcx()),ctx)
        merged=m.merge_workout(d,m.parse_tcx(tcx()),{'id':ctx['id'],'date':ctx['date'],'type':'running'},True)
        self.assertEqual(merged['workouts'][0]['context']['sensations'],'Bien')
        self.assertEqual(merged['workouts'][0]['running']['treadmill']['inclinePct'],.5)
    def test_rejects_dtd(self):
        with self.assertRaises(ValueError):m.parse_tcx(b'<!DOCTYPE foo>'+tcx())

if __name__=='__main__':unittest.main()
