/**
 * Converts weight from ounces to pounds: {@code lb = oz / 16}.
 * Uses floating-point division (not integer division) so fractional ounces stay precise.
 */
export function ouncesToPounds(ounces: number): number {
    return ounces / 16;
}
