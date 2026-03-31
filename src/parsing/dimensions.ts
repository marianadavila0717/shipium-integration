import type { ShipiumOrder } from "../domain/order-types";
import { ValidationError } from "../errors/validation-error";

/**
 * Internal: parses `dims` for mapping and validation.
 * Splits on `x` (case-insensitive), trims each segment, parses floats — supports `10x8x6` and `10 x 8 x 6`.
 */
export function parseDimensions(dimRaw: unknown): {
    length: number;
    width: number;
    height: number;
    unit: "in";
} {
    if (dimRaw === undefined || dimRaw === null) {
        throw new ValidationError("Dimensions cannot be empty");
    }
    if (typeof dimRaw !== "string") {
        throw new ValidationError("Invalid dimension format: dimensions must be numbers");
    }
    const dimStr = dimRaw.trim();
    if (dimStr === "") {
        throw new ValidationError("Dimensions cannot be empty");
    }

    const parts = dimStr.split(/x/i).map((s) => s.trim());
    if (parts.length !== 3) {
        throw new ValidationError("Invalid dimension format: must be LxWxH");
    }

    const nums = parts.map((p) => parseFloat(p));
    if (nums.some((n) => Number.isNaN(n))) {
        throw new ValidationError("Invalid dimension format: dimensions must be numbers");
    }
    if (nums.some((n) => n <= 0)) {
        throw new ValidationError("All dimensions must be greater than 0");
    }

    const length = nums[0]!;
    const width = nums[1]!;
    const height = nums[2]!;

    return {
        length,
        width,
        height,
        unit: "in",
    };
}

/**
 * Parses a customer {@code dims} string ({@code "LxWxH"} with optional spaces around {@code x})
 * into Shipium dimensions (inches).
 */
export function parseDimensionString(dims: string): ShipiumOrder["items"][number]["dimensions"] {
    return parseDimensions(dims);
}
