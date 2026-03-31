/** Trims a string; returns `undefined` for non-strings or empty-after-trim. */
export function trimStr(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const t = value.trim();
    return t.length > 0 ? t : undefined;
}
