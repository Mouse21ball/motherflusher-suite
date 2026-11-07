/**
 * OpenSeat — an empty seat that READS empty (P1, 2026-11-06).
 *
 * The server pads the players array with open seats (name "Open",
 * presence "open"/"empty", status "sitting_out"). The tables used to
 * dress those seats in the animal portraits, so an empty seat looked
 * occupied. An open seat now renders as a dim dashed gold ring with its
 * seat number and an OPEN plate — never a portrait, never cards.
 */

interface OpenSeatProps {
  /** 1-based seat number shown inside the ring. */
  seatNumber?: number;
}

export function OpenSeat({ seatNumber }: OpenSeatProps) {
  return (
    <div
      data-testid="open-seat"
      className="flex flex-col items-center"
      style={{ opacity: 0.85 }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          border: '2px dashed rgba(201,162,39,0.38)',
          background: 'rgba(10,5,25,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          {seatNumber ?? ''}
        </span>
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 9,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: '0.28em',
          textIndent: '0.28em',
          color: 'rgba(255,255,255,0.42)',
        }}
      >
        OPEN
      </div>
    </div>
  );
}
