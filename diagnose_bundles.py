import json, glob
for f in sorted(glob.glob("artifacts/judge_render/bundle_*.json")):
    d = json.load(open(f))
    overall = "pass" if d.get("overall_pass") else "FAIL"
    print(f, overall)
    for c in d.get("checks", []):
        mark = "PASS" if c.get("pass") else "FAIL"
        print(f"  [{mark}] {c['name']}: {c.get('detail', '')}")
