import type { CustomerOrder } from "../domain/order-types";
import { ValidationError } from "../errors/validation-error";
import { parseDimensions } from "../parsing/dimensions";
import { trimStr } from "../utils/strings";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireField(name: string, value: string | undefined): string {
    if (value === undefined) throw new ValidationError(`Missing required field: ${name}`);
    return value;
}

function validateEmail(email: string | undefined): void {
    if (email === undefined || email === "") return;
    if (!EMAIL_REGEX.test(email.trim())) {
        throw new ValidationError("Invalid email format for customer.email");
    }
}

/** Re-throws dimension parse errors with the line item index for easier debugging. */
function parseDimensionsForLineItem(index: number, dims: unknown): void {
    try {
        parseDimensions(dims);
    } catch (e) {
        if (e instanceof ValidationError) {
            throw new ValidationError(`items[${index}].dims: ${e.message}`);
        }
        throw e;
    }
}

function isValidOrderPlacedTs(value: string): boolean {
    const t = Date.parse(value);
    return !Number.isNaN(t);
}

/** ISO 8601 datetime should include a timezone (Z or numeric offset). */
function orderDateHasTimezone(value: string): boolean {
    const s = value.trim();
    return /Z$/i.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s);
}

function isValidRequestedShipDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isUsPostalCode(postal: string): boolean {
    return /^\d{5}(-\d{4})?$/.test(postal);
}

function isCanadianPostalCode(postal: string): boolean {
    const compact = postal.replace(/\s/g, "").toUpperCase();
    return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact);
}

function validatePostalCode(country: string, postal: string): void {
    const c = country.toUpperCase();
    if (c === "US" && !isUsPostalCode(postal)) {
        throw new ValidationError("Invalid postal code format for US");
    } else if (c === "CA" && !isCanadianPostalCode(postal)) {
        throw new ValidationError("Invalid postal code format for Canada");
    }
}

function validatePositiveFiniteNumber(name: string, value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ValidationError(`${name} must be a valid number`);
    }
    return value;
}

/**
 * Phase 3 — Validates required fields, data formats, and business rules. Does not mutate input.
 * Invoked at the start of `transformOrder` (validate before map). Order of checks: root → order
 * header → dates → customer → address → items (fail fast). Each line’s `dims` is parsed once here
 * so bad strings surface before mapping.
 */
export function validateCustomerOrder(input: CustomerOrder): void {
    if (input == null || typeof input !== "object") {
        throw new ValidationError("Order data is missing");
    }

    const orderNumber = trimStr(input.orderNumber);
    if (orderNumber === undefined) {
        throw new ValidationError("Missing required field: orderNumber");
    }

    const orderDate = trimStr(input.orderDate);
    if (orderDate === undefined) {
        throw new ValidationError("Missing required field: orderDate");
    }
    if (!isValidOrderPlacedTs(orderDate)) {
        throw new ValidationError("orderDate must be a valid ISO 8601 datetime");
    }
    if (!orderDateHasTimezone(orderDate)) {
        throw new ValidationError("orderDate must include a timezone (e.g. Z or +00:00)");
    }

    const requestedShipDate = trimStr(input.requestedShipDate);
    if (requestedShipDate === undefined) {
        throw new ValidationError("Missing required field: requestedShipDate");
    }
    if (!isValidRequestedShipDate(requestedShipDate)) {
        throw new ValidationError("requestedShipDate must be YYYY-MM-DD");
    }

    const customer = input.customer;
    if (customer == null || typeof customer !== "object") {
        throw new ValidationError("Missing required field: customer");
    }

    requireField("customer.custId", trimStr(customer.custId));

    const fullName = trimStr(customer.fullName);
    if (fullName === undefined) {
        throw new ValidationError("Missing required field: customer.fullName");
    }

    validateEmail(customer.email);

    const address = customer.shippingAddr;
    if (address == null || typeof address !== "object") {
        throw new ValidationError("Missing shipping address");
    }

    requireField("customer.shippingAddr.street1", trimStr(address.street1));
    requireField("customer.shippingAddr.city", trimStr(address.city));
    requireField("customer.shippingAddr.state", trimStr(address.state));
    requireField("customer.shippingAddr.zip", trimStr(address.zip));
    const countryRaw = requireField("customer.shippingAddr.country", trimStr(address.country));
    const country = countryRaw.toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
        throw new ValidationError("country must be a 2-letter ISO 3166-1 alpha-2 code");
    }
    validatePostalCode(country, trimStr(address.zip)!);

    if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new ValidationError("Order must have at least one item");
    }

    requireField("shipFromWarehouse", trimStr(input.shipFromWarehouse));
    requireField("serviceLevel", trimStr(input.serviceLevel));

    for (let index = 0; index < input.items.length; index++) {
        const item = input.items[index]!;
        requireField(`items[${index}].sku`, trimStr(item.sku));
        requireField(`items[${index}].description`, trimStr(item.description));

        const qty = validatePositiveFiniteNumber(`items[${index}].qty`, item.qty);
        if (qty <= 0) {
            throw new ValidationError(`items[${index}].qty: Quantity must be greater than 0`);
        }
        if (!Number.isInteger(qty)) {
            throw new ValidationError(`items[${index}].qty: Quantity must be a positive integer`);
        }

        const weightOz = validatePositiveFiniteNumber(`items[${index}].weight_oz`, item.weight_oz);
        if (weightOz <= 0) {
            throw new ValidationError(`items[${index}].weight_oz: Weight must be greater than 0`);
        }

        parseDimensionsForLineItem(index, item.dims);
    }
}
