# Selection Sunday reveal video (full build kit)

Built for Season 3. Everything here is generic: **no team, field or bubble data is committed** (the field lives only in a private scratch folder while the video is made, and the commissioner watches the video before anything is published).

## Pipeline (about 2 hours for a ~15 minute video)
1. **Field** (`analyze.cjs`, `build_field.mjs`): `analyze.cjs <export.json>` finds each conference's tournament champion (the 31 automatic bids) and writes `champs.json`. `build_field.mjs <export.json> <champs.json> <outdir>` reads a private `committee.json` next to it
   (`{"removeAtLarge":[ids],"addAtLarge":[ids],"firstFourOut":[4 ids],"nextFourOut":[4 ids]}`: the committee's changes to the Board's top 37 and the bubble order), applies the Dayton Rule (First Four games seeded where they fit),
   the hard no-same-conference-in-rounds-1-2 rule, and writes `field.json`, `outs.json` (the 8 teams on the bubble), `picks.json` (the same field in the site's pick format) with generated, fact-checked write-ups. It prints only counts.
2. **Plan** (`make_plan.mjs <dir> <season>`, e.g. `4`; the season number on every title card comes from here): the clip timeline, in whole beats of the soundtrack (so every seed slam lands on a beat), plus sound-effect events -> `plan.json`.
3. **Render** (`renderer.html` + `render_clips.cjs`): serve a folder with `index.html` (= renderer.html), `fonts/`, `assets/` (symlinks to the repo's) and a data folder holding `field.json`, `outs.json`, `plan.json`
   (`python3 -m http.server 8011`), then `node render_clips.cjs <data dir> <clips dir> 6`. One mp4 per clip, frames piped straight into ffmpeg, resumable.
4. **Audio** (`make_audio.py <plan.json> <music.m4a> <out.wav>`): the commissioner's track looped on the beat (this one is ~180 BPM, body loops every 80 beats; re-measure for a new track), ducked under reveals, darker for the bubble segment, plus synthesized effects.
5. **Assemble**: concat the clips (`ffmpeg -f concat -c copy`), mux the audio (AAC, `loudnorm` to about -16 LUFS), also a ~50 MB copy.

## Privacy while making it
Refer to teams by id in anything printed or written visibly; check the layout with `make_test_data.mjs` (teams that are NOT in the field, made-up seeds and placeholder text) and `preview.cjs` + `sheet.py` contact sheets; never view a frame of the real field.
Text-fit warnings print only a length. The only thing the commissioner sees before the video is the finished file.

## Look
Arena background, light sweeps, glass panels, seed slam (flash, shake, sparks), logo streak, full-screen card (logo tile + write-up), the card flying into the region bracket with a gold pulse and lens flare, a region-complete view, the full-field finale, the "on the outside looking in" bubble segment (First Four Out and Next Four Out, 8 down to 1), and an outro.
