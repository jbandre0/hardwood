# Which design patterns separate AI-built sites from human-built ones?

**What this is:** a source-code study of 100 AI-built and 100 human-built web projects from GitHub, used to decide what to change on Hardwood Sim. **What it is not:** a study of 200 live websites. The container this was run in cannot reach ordinary websites (only GitHub, npm, PyPI and Google Fonts), so rendered pages could not be examined.

## Method
- **AI-built (n=100):** 50 Lovable (README template marker), 20 v0 (topic plus `components.json` + shadcn), 15 Bolt (`vite-react-typescript-starter` or `.bolt/`), 15 self-described vibe-coded (topic only). Sampled at random (seed 20261112) from search pools of about 1,250 repos, created 2024-25.
- **Human-built (n=100):** repos created **before 2021** (before AI coding assistants), 65 plain CSS/Bootstrap sites and 35 Tailwind sites. The Tailwind ones are the control that separates "uses Tailwind" from "AI-built".
- **Source:** front-end files fetched from raw.githubusercontent.com by following `<link>`, imports and standard paths. Third-party text was only pattern-counted, never executed. Stock shadcn primitives (`components/ui/*`) were excluded, because they ship with animations, shadows and blur regardless of the design (an early run without this exclusion overstated several features).
- **Features:** 28 regex-detected design patterns, compared with Fisher's exact test, with the human-Tailwind group as the control.

## Result: what actually separates them (share of repos showing the pattern)
| Pattern | AI | Human | Human + Tailwind | Holds against Tailwind control? |
|---|---|---|---|---|
| Entrance / fade-in animations | 52% | 7% | 9% | yes |
| Glassmorphism (backdrop blur) | 49% | 9% | 9% | yes |
| Gradient backgrounds | 60% | 21% | 17% | yes |
| Gradient text | 30% | 4% | 0% | yes |
| Soft, large shadows | 34% | 8% | 11% | yes (p=.015) |
| Blurred glow orbs | 20% | 3% | 0% | yes |
| High colour variety | 34% | 18% | 6% | yes |
| Hover lift / scale | 39% | 23% | 3% | yes |
| Three-column feature grid | 45% | 16% | 29% | no (p=.11) |
| Inter font | 27% | 7% | 11% | borderline (p=.065) |
| Purple/violet/indigo palette | 35% | 18% | 20% | no |
| Mostly large corner radii | 40% | 25% | 29% | no |
| Tracked uppercase labels | 24% | 19% | 9% | borderline (p=.053) |

**Folklore the data did not support** (about equally common in both groups): left-border accent cards (9% vs 9%), pill badges, buzzword copy, stat-counter rows, serif display fonts. Emoji and em dashes were more common in AI repos but not after controlling for Tailwind.
**Human tells:** jQuery (0% vs 34%), Bootstrap (5% vs 35%), lorem ipsum (1% vs 18%), three or more fonts (3% vs 21%), heavy centre alignment (19% vs 35%).
**Tooling fingerprints** (not visual): lucide icons 93% vs 1%, shadcn/ui 76% vs 1%, Radix 73% vs 0%.

A simple naive-Bayes model on the 24 visual features alone classifies the 200 repos with **76%** leave-one-out accuracy (chance 50%). Design patterns carry real signal and are nowhere near conclusive.

## What changed on this site, and why
Driven by the data (patterns that held against the control): removed all entrance animations; removed every gradient (hero, bars, topbar, skeletons, even the select arrow); replaced the row of three stat tiles with a plain stat line; put long tables directly on the page instead of in boxed cards.
Driven by judgment (data was weak or null, so treat as taste, not evidence): tighter corner radii, rectangular buttons and tags instead of pills, sentence-case labels instead of tracked uppercase eyebrows.
Kept deliberately: the condensed uppercase headline face (from your reference), the dark green palette, the logos.

Site AI-likeness index (visual features only, higher = more AI-like; human median -3.7, AI median +2.8): **+3.3 before, -4.5 after.** This is circular: the index is built from the same patterns that were removed. It shows the measured patterns are gone, not that a person would judge the site human-made.

## Limitations (read these)
1. Code, not pixels: no page was rendered. 2. Era confound: the AI repos are 2024-25 and the human repos pre-2021, so some differences (glass, gradients, motion) are partly design fashion rather than AI. The Tailwind control addresses tooling, not era. 3. Labels are self-declared (README/topic/fingerprint); pre-2021 is assumed human. 4. The human sample skews to portfolio and landing pages. 5. Regex detection is crude, and each feature is present/absent, not intensity. 6. Nothing here measures how people perceive the site.

Reproduce: `python3 research/collect.py && python3 research/fetch.py && python3 research/analyze.py && python3 research/compare.py && python3 research/score.py <site-root>` (the fetch step writes the corpus outside the repo; it is not committed).
