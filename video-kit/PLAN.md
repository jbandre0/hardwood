# Selection Sunday video kit (Season 2)

Private handoff for the Selection Sunday reveal video. **Do not print or summarize team names in chat until the commissioner has watched the video** (they asked not to see the field first). Do not commit the field in plain text, the video, or any frames to the repo.

## Inputs
- `field.enc`: AES-256 (openssl `-aes-256-cbc -pbkdf2 -iter 200000 -a`) of `selection-sunday-field.json`. The commissioner gives you the passphrase in chat. Decrypt to the scratchpad only:
  `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -a -in video-kit/field.enc -pass pass:<passphrase> > field.json`
- `field.json` is an array of 68 objects: `{team, seed, region, bid ("Auto"|"At-large"), ff (null | 1-4), id, blurb}`. The 11 line holds two First Four games (ff 1 and 2, both teams share seed and region) and the 16 line holds two (ff 3 and 4). The blurb is already written and fact-checked (2-3 sentences). Use it verbatim.
- Logos: `data/logos.json` (slug -> file) + `assets/logos/<slug>.png` (144px; slug is in `data/league.json` by team id). Fonts: `fonts/BarlowCondensed-800.woff2`, `BarlowCondensed-600.woff2`, `Barlow-600.woff2`. Hardwood Sim mark: `assets/brand/icon-512.png` and `assets/brand/hardwood-mark.png`.
- `sample-reveal.html`, `sample-render.cjs`, `sample-audio.cjs`: the working 14 second sample (8 BYU, 9 Colorado) the commissioner approved: canvas renderer `window.render(t)`, Playwright frame loop, synthesized soundtrack. Reuse the look: dark arena, spotlight sweeps, floor grid, glass panels, seed slam with flash and shake, logo streak, bracket zoom, gold glow, Barlow Condensed type.

## What to build (1920x1080, 30 fps, about 12 minutes, with sound)
1. **Intro (~15 s)**: Hardwood Sim logo materializing with a glass shatter or light sweep and a bass drop, then "SELECTION SUNDAY · SEASON 2" and a "68 TEAMS. 4 REGIONS. 1 CHAMPION." counter. Make it flashy.
2. **Four regions in the order East, South, West, Midwest**, each with a title card. Within a region reveal in **bracket order**: 1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15. So the 1 seed, then the 16 seed it plays, then the 8 seed, then the 9 it plays, and so on. A First Four slot reveals both of its teams back to back (same slot, two teams, a "First Four" tag).
3. **Per team**: seed number slams in (flash, shake, sparks, sub boom), the logo streaks across, then a **full-screen** layout: logo on a glass tile on the left and the blurb on a glass panel on the right with the record and conference line (record and conference are in the blurb's first words; also show conference and Auto/At-large as a tag). Hold time scales with blurb length (about 7 s for reading), then everything flies into that team's slot on the crystal-glass bracket, with a gold pulse and a glass "ting". Show the whole region's bracket filling in as it goes (previous teams stay in their slots).
4. **Each region ends** on its completed bracket. **Finale**: all four regions together with 68 logos and a "THE FIELD OF 68" title, then a Hardwood Sim outro.
5. Add tasteful extra effects (lens flares, particle bursts, parallax, light sweeps, a soundtrack that builds). No voiceover.

## How to build it cheaply
- Use Sonnet. One template driven by `field.json`. Test on six awkward teams first (a 1 seed, a First Four 11, a First Four 16, a long name like Arkansas–Pine Bluff, a 16 seed, a long blurb). Check with **contact sheets** (ffmpeg `tile`), not one frame at a time.
- Render **one mp4 clip per team and per scene**, piping raw frames from the page straight into ffmpeg (no PNG files on disk: the disk allowance is small). Run 4 workers in parallel (4 CPUs). Make it resumable: skip clips that already exist. Run it in the background and poll sparsely (`mcp__claude-code-remote__send_later` or a long bounded wait), not every minute.
- Join the clips with ffmpeg concat, mix the synthesized soundtrack, check one contact sheet per region and the audio levels, and deliver with `SendUserFile`. If the master is too large, also make a ~50 MB version.
- Hold off on filing HQ's bracket challenge entry until the commissioner has watched the video and says to file it.
