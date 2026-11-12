"""Run the reference Python engine on a list of matchups.
usage: TEAMS_JSON=<eng rows json> python3 run_pairs.py pairs.json out.json
pairs.json = [[teamA, teamB, venue], ...]"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hoops_engine as E
pairs = json.load(open(sys.argv[1]))
out = [E.predict(a, b, v, ng=40000, seed=7) for a, b, v in pairs]
json.dump(out, open(sys.argv[2], "w"))
print(len(out), "matchups done")
