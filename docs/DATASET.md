# EcoSort Dataset

Target: **100,000+ original images**. Live progress at `GET /api/dataset/targets`
and Research → Dataset. Current: **23,172 / 100,000** (v3).

## Canonical 13-class taxonomy

Battery, Brown Glass, Cardboard, Clothes, Glass, Green Glass, Metal,
Organic Waste, Paper, Plastic, Shoes, Trash, White Glass.

The model and on-disk corpus cover 10 classes (`biological/` on disk =
Organic Waste canonically). Brown/Green/White Glass have **no data** and are
shown as "Missing from current model dataset / data acquisition needed" —
never synthesized.

## Versions (immutable)

- **v1** — 8,858 (first audited split of the base corpus).
- **v2** — 10,421 (conservative near-duplicate threshold + quality gating).
- **v3** — 23,172 (added Garbage-YOLO-khoaliamle: 12,751 new, MIT
  uploader-declared, robot-ready tagged). The v3 registry entry, checkpoints,
  metrics and evaluation artifacts are frozen records and never rewritten.
- **Working set past v3** — TrashNet-garythung import added 163 genuinely new
  images (paper +33, trash +11 — the measured weak classes; 1,537 exact and
  827 near duplicates skipped). Verified total now 23,335. Note: this import
  ran before stable-split enforcement, so working manifests were rebuilt
  once; the audit now keeps existing split assignments (see Splits), and this
  cannot recur.
- **v4 (planned)** — v3 + verified candidates, re-validated
  (quality, exact + near-duplicate, class, split, provenance). v3 stays frozen.

## Quality gates (every audit)

Total imported → valid / invalid → corrupt → exact duplicates →
near duplicates → low-quality → unmapped → verified → train candidates.
See `GET /api/dataset/health` (100K health report).

## Sources & licences

`GET /api/dataset/sources`. The bundled base corpus is flagged
licence-unknown (verify before redistributing). Every new import records name,
source, URL, licence, dates, counts and class mapping. No scraping, no unclear
rights. Robot-ready tags (`--robot-ready`) mark real-world diversity images.

## Splits

Seeded stratified 70/15/10 (config `SPLIT_RATIOS`). Near-duplicate groups are
collapsed before splitting, so the same image can never appear in both
training and test. Split assignment is **stable**: files already listed in a
manifest keep their split across re-audits — ingesting new data only assigns
previously-unassigned files, so a frozen test image can never migrate into
training (or vice versa).
