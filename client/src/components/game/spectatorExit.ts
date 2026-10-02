export function isForfeitConfirmationRequired(isMidHand: boolean, spectating: boolean) {
  return isMidHand && !spectating;
}