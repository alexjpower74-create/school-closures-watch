# Negative controls for the app suite (run from the repo root: python3 app/tests/negative-controls.py).
# Each control patches one file, runs its specs (expect red), restores with git checkout, runs again (expect green).
import subprocess, re, sys
# Restores use `git checkout`, which would also wipe any uncommitted work in the patched files. Refuse to run then.
_dirty = [l for l in subprocess.run(["git", "status", "--porcelain", "--", "app"], capture_output=True, text=True).stdout.splitlines()
          if "app/tests/shots/" not in l]
if _dirty:
  sys.exit("negative-controls: commit app/ first (uncommitted: " + ", ".join(l[3:] for l in _dirty) + ")")

CONTROLS = [
  ("C1 may_apply rendered as applied (exact-match-only bug)", "app/render.js",
   [("  const applied = (st.applies || [])", "  const applied = [...(st.applies || []), ...(st.may_apply || []).map((m) => ({ notice_id: m.notice_id, how: 'exact' }))]"),
    ("  for (const m of st.may_apply || []) {", "  for (const m of []) {")],
   ["app/tests/storm.spec.mjs", "app/tests/csfp.spec.mjs"]),
  ("C2 stale banner removed", "app/common.js",
   [("const stale = (sources || []).filter((s) => s && s.kind === 'used' && s.stale)", "const stale = []")],
   ["app/tests/stale.spec.mjs"]),
  ("C3 sort broken (rank ignored)", "app/labels.js",
   [("return a.rank - b.rank || ", "return 0 * (a.rank - b.rank) || ")],
   ["app/tests/storm.spec.mjs"]),
  ("C4 quote guard removed", "app/text.js",
   [("return normText(notice.source_text).includes(q)", "return true")],
   ["app/tests/guard.spec.mjs"]),
  ("C5 tap target shrunk below 44 px (.button-link to 30 px)", "app/app.css",
   [(".button-link {\n  min-height: 44px;", ".button-link {\n  min-height: 30px;\n  max-height: 30px;\n  padding-block: 0;")],
   ["app/tests/layout.spec.mjs"]),
]
def run(specs):
  p = subprocess.run(["npx", "playwright", "test", "-c", "app/playwright.config.mjs", "--project", "chromium-390", "--project", "webkit-1280", "--reporter=line", *specs], capture_output=True, text=True)
  lines = (p.stdout + p.stderr).splitlines()
  summary = " | ".join(l.strip() for l in lines if re.search(r"^\s+\d+ (passed|failed|skipped)", l))
  failed, errs, tail = [], [], False
  for i, l in enumerate(lines):
    if re.search(r"^\s+\d+ failed", l): tail = True; continue
    if tail and re.search(r"^\s+\[", l): failed.append(l.strip())
    if tail and re.search(r"^\s+\d+ (passed|skipped)", l): tail = False
    if l.strip().startswith("Error:") and len(errs) < 3:
      block = [l.strip()] + [x.strip() for x in lines[i+1:i+6] if re.search(r"(Expected|Received|Locator|Timeout|\+|\-)", x)][:3]
      errs.append(" / ".join(block))
  return p.returncode, summary, failed, errs
for name, f, subs, specs in CONTROLS:
  orig = open(f).read(); s = orig
  for a, b in subs:
    assert a in s, (name, a); s = s.replace(a, b)
  open(f, "w").write(s)
  try:
    code, summary, failed, errs = run(specs)
  finally:
    subprocess.run(["git", "checkout", "--", f]); 
  code2, summary2, _, _ = run(specs)
  print(f"\n## {name}\nbroken: exit {code}: {summary}")
  for t in failed: print("    failed:", t)
  for e in errs: print("    first error:", e)
  print(f"restored: exit {code2}: {summary2}")
  sys.stdout.flush()
