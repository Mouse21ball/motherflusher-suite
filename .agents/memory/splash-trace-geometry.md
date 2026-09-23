---
name: Splash trace geometry
description: Constraint for animating electricity across the poster-based chain emblem.
---

For a poster-based splash, keep the artwork faintly visible and use the supplied emblem itself as the illumination source, with any moving trace constrained to the emblem’s actual metal geometry. Do not draw a separate looping path over the poster.

**Why:** An independent SVG route can drift away from the chain and read as a random spark instead of light traveling through metal.

**How to apply:** Align the trace mask to the poster’s chain coordinates, animate one bounded pass, then hold the completed artwork until the user enters.