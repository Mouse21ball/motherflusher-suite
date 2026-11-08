/**
 * TableFelt — the ONE table system for every poker mode (P1, 2026-11-06).
 *
 * Badugi, Flushed Up and Box Chevy all mount this exact presentation:
 * a dimensional table side, a REAL metallic gold rail with visible width,
 * a woven purple felt with warm-top / deep-bottom lighting and an inner
 * gold pinline, and the CGP chain mark + mode name printed in the felt
 * (the WSOP pattern). Mode identity survives only as a faint felt tint.
 *
 * Geometry preserves Badugi's shipped felt footprint (Detroit 2026-10-19:
 * seats sit on the container, so the felt must frame them, not shrink
 * under them). Everything is pointer-events-none and purely presentational
 * — no gameplay state reads anything from this component.
 */

interface TableFeltProps {
  /** Mode name printed in the felt, e.g. "BADUGI". */
  modeName: string;
  /** Faint mode-accent tint washed over the felt center (rgba string). */
  tint?: string;
}

// P4: the felt print and every UI surface share ONE chain mark —
// the shared ChainMark component (extracted from this felt original).
import { ChainMark } from '@/components/ChainMark';

export function TableFelt({ modeName, tint }: TableFeltProps) {
  return (
    <>
      {/* Table side / near-edge thickness — the offset dark body under
          the rail that gives the table its viewed-at-an-angle depth. */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '3%', right: '3%', top: '12.5%', bottom: '29.5%',
          borderRadius: '50%',
          background: 'linear-gradient(180deg, #170c2e 0%, #0d0619 100%)',
          boxShadow: '0 14px 36px rgba(0,0,0,0.75), 0 4px 10px rgba(0,0,0,0.6)',
        }}
      />
      {/* The rail — a real metallic gold band with visible width, lit
          from above, darkened at its lower edge. The felt inset inside
          leaves this band exposed on every side. */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '2.2%', right: '2.2%', top: '8.8%', bottom: '32.8%',
          borderRadius: '50%',
          background: 'linear-gradient(165deg, #8a6a1f 0%, #e9c766 22%, #a37f27 45%, #f3d67c 68%, #7c5f18 100%)',
          boxShadow: 'inset 0 2px 3px rgba(255,240,190,0.55), inset 0 -3px 6px rgba(60,40,0,0.55), 0 2px 10px rgba(0,0,0,0.5)',
        }}
      />
      {/* The felt — woven texture over dimensional lighting: warm light
          pooling at the top (far edge, under the yard lights), deep
          shadow at the bottom (near edge). Inner gold pinline in the
          inset shadow ring. */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '3.5%', right: '3.5%', top: '10%', bottom: '34%',
          borderRadius: '50%',
          background: `
            ${tint ? `radial-gradient(ellipse at 50% 45%, ${tint} 0%, transparent 62%),` : ''}
            radial-gradient(ellipse at 50% 0%, rgba(255,196,96,0.16) 0%, transparent 55%),
            repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px),
            repeating-linear-gradient(-45deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 3px),
            radial-gradient(ellipse at 50% 78%, #4d348a 0%, #3a2768 38%, #271a4a 68%, #1a0f30 100%)
          `,
          boxShadow: `
            inset 0 0 0 2px rgba(240,184,41,0.28),
            inset 0 -3px 14px rgba(255,220,150,0.11),
            inset 0 14px 28px rgba(0,0,0,0.42),
            inset 0 0 60px rgba(0,0,0,0.32)
          `,
        }}
      />
      {/* Center-felt branding — the chain mark and mode name printed IN
          the felt. Kept faint: it is a felt print, not a UI element.
          P3: lifted from 38% to 30.5% and shrunk — Badugi and Flushed Up
          anchor the pot at y≈42%, and the pot label/amount used to land
          directly on the mode-name line ("BA[POT]GI"). The print now
          sits in the clear felt between the top seats and the pot. */}
      <div
        className="absolute pointer-events-none flex flex-col items-center"
        style={{ left: '50%', top: '30.5%', transform: 'translate(-50%, -50%)' }}
      >
        <ChainMark width={46} color="rgba(240,184,41,0.20)" />
        <div
          style={{
            marginTop: 4,
            fontFamily: 'Oswald, sans-serif',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.34em',
            transform: 'translateX(0.17em)',
            color: 'rgba(253,230,138,0.18)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {modeName}
        </div>
        <div
          style={{
            marginTop: 2,
            fontFamily: 'Oswald, sans-serif',
            fontSize: 7.5,
            fontWeight: 600,
            letterSpacing: '0.26em',
            transform: 'translateX(0.13em)',
            color: 'rgba(253,230,138,0.11)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Chain Gang Poker
        </div>
      </div>
    </>
  );
}
