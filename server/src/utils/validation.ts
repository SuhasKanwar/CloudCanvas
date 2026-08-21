export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
    return typeof value === "string";
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function isNullableStringField(value: Record<string, unknown>, field: string): boolean {
    return value[field] === undefined || value[field] === null || isString(value[field]);
}
