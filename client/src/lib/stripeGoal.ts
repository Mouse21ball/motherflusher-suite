/** Home progress copy; crew creation and the Gold Frame both cost 100 Stripes. */
export function getStripeGoal(stripes: number): { label: string; progress: number } {
  if (stripes < 100) {
    return { label: `${100 - stripes}◆ away from a Gold Frame or creating a Crew`, progress: stripes / 100 };
  }
  if (stripes < 125) {
    return { label: `${125 - stripes}◆ away from your first avatar`, progress: (stripes - 100) / 25 };
  }
  return { label: 'Ready to create a Crew', progress: 1 };
}