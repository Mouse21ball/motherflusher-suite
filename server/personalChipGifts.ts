/**
 * Resolve requested seat ids against the live authoritative seat map.
 * Recipients are never accepted as profile ids from the request.
 */
export function resolveGiftSeats(
  seatToIdentityId: Map<string, string>,
  humanSeats: Set<string>,
  connectedSeats: Set<string>,
  senderIdentityId: string,
  recipientSeatId: string,
): { senderId: string; recipientId: string } | null {
  let senderSeatId: string | undefined;
  for (const [seatId, identityId] of seatToIdentityId) {
    if (identityId === senderIdentityId) {
      senderSeatId = seatId;
      break;
    }
  }
  if (!senderSeatId || !humanSeats.has(senderSeatId) || !connectedSeats.has(senderSeatId)) return null;
  if (recipientSeatId === senderSeatId || !humanSeats.has(recipientSeatId) || !connectedSeats.has(recipientSeatId)) return null;
  const recipientId = seatToIdentityId.get(recipientSeatId);
  if (!recipientId || recipientId === senderIdentityId) return null;
  return { senderId: senderIdentityId, recipientId };
}