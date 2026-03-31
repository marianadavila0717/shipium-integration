import type { CustomerOrder } from "../src";
import { validateCustomerOrder, ValidationError, transformOrder } from "../src";

/** Minimal valid order for branching invalid fields in tests. */
const base: CustomerOrder = {
    orderNumber: "ORD-BASE",
    orderDate: "2026-01-15T12:00:00Z",
    customer: {
        custId: "CUST-1",
        fullName: "Test Customer",
        email: "test@example.com",
        shippingAddr: {
            street1: "1 Main St",
            city: "Seattle",
            state: "WA",
            zip: "98101",
            country: "US",
        },
    },
    items: [
        {
            sku: "SKU-1",
            description: "Item",
            qty: 1,
            weight_oz: 16,
            dims: "10x8x6",
        },
    ],
    shipFromWarehouse: "DC-1",
    requestedShipDate: "2026-01-16",
    serviceLevel: "GROUND",
};

function expectValidationError(fn: () => void, message: string): void {
    try {
        fn();
        throw new Error("expected ValidationError");
    } catch (e) {
        if (e instanceof Error && e.message === "expected ValidationError") throw e;
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as Error).message).toBe(message);
    }
}

describe("validateCustomerOrder — required fields", () => {
    it("rejects missing orderNumber", () => {
        const o = { ...base, orderNumber: "" };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: orderNumber");
    });

    it("rejects missing orderDate", () => {
        const o = { ...base, orderDate: "" };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: orderDate");
    });

    it("rejects missing customer", () => {
        const o = { ...base, customer: undefined as unknown as CustomerOrder["customer"] };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: customer");
    });

    it("rejects missing customer.custId", () => {
        const o = {
            ...base,
            customer: { ...base.customer, custId: "   " },
        };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: customer.custId");
    });

    it("rejects missing customer.fullName", () => {
        const o = {
            ...base,
            customer: { ...base.customer, fullName: "" },
        };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: customer.fullName");
    });

    it("rejects missing shipping address", () => {
        const o = {
            ...base,
            customer: { ...base.customer, shippingAddr: undefined as unknown as typeof base.customer.shippingAddr },
        };
        expectValidationError(() => validateCustomerOrder(o), "Missing shipping address");
    });

    it("rejects empty items array", () => {
        const o = { ...base, items: [] };
        expectValidationError(() => validateCustomerOrder(o), "Order must have at least one item");
    });

    it("rejects missing shipFromWarehouse", () => {
        const o = { ...base, shipFromWarehouse: "" };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: shipFromWarehouse");
    });

    it("rejects missing serviceLevel", () => {
        const o = { ...base, serviceLevel: "" };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: serviceLevel");
    });

    it("rejects missing requestedShipDate", () => {
        const o = { ...base, requestedShipDate: "" };
        expectValidationError(() => validateCustomerOrder(o), "Missing required field: requestedShipDate");
    });

    it("rejects empty items[].dims", () => {
        const o = {
            ...base,
            items: [{ ...base.items[0]!, dims: "   " }],
        };
        expectValidationError(() => validateCustomerOrder(o), "items[0].dims: Dimensions cannot be empty");
    });
});

describe("validateCustomerOrder — data formats", () => {
    it("rejects orderDate without timezone", () => {
        const o = { ...base, orderDate: "2026-01-15T12:00:00" };
        expectValidationError(
            () => validateCustomerOrder(o),
            "orderDate must include a timezone (e.g. Z or +00:00)",
        );
    });

    it("rejects invalid requestedShipDate format", () => {
        const o = { ...base, requestedShipDate: "01/16/2026" };
        expectValidationError(() => validateCustomerOrder(o), "requestedShipDate must be YYYY-MM-DD");
    });

    it("rejects invalid email when present", () => {
        const o = {
            ...base,
            customer: { ...base.customer, email: "not-an-email" },
        };
        expectValidationError(() => validateCustomerOrder(o), "Invalid email format for customer.email");
    });

    it("rejects invalid US postal code", () => {
        const o = {
            ...base,
            customer: {
                ...base.customer,
                shippingAddr: { ...base.customer.shippingAddr, zip: "ABCDE" },
            },
        };
        expectValidationError(() => validateCustomerOrder(o), "Invalid postal code format for US");
    });

    it("rejects country code that is not two letters", () => {
        const o = {
            ...base,
            customer: {
                ...base.customer,
                shippingAddr: { ...base.customer.shippingAddr, country: "USA" },
            },
        };
        expectValidationError(
            () => validateCustomerOrder(o),
            "country must be a 2-letter ISO 3166-1 alpha-2 code",
        );
    });
});

describe("validateCustomerOrder — business logic", () => {
    it("rejects non-positive quantity", () => {
        const o = {
            ...base,
            items: [{ ...base.items[0]!, qty: 0 }],
        };
        expectValidationError(() => validateCustomerOrder(o), "items[0].qty: Quantity must be greater than 0");
    });

    it("rejects non-integer quantity", () => {
        const o = {
            ...base,
            items: [{ ...base.items[0]!, qty: 1.5 }],
        };
        expectValidationError(() => validateCustomerOrder(o), "items[0].qty: Quantity must be a positive integer");
    });

    it("rejects non-positive weight_oz", () => {
        const o = {
            ...base,
            items: [{ ...base.items[0]!, weight_oz: 0 }],
        };
        expectValidationError(() => validateCustomerOrder(o), "items[0].weight_oz: Weight must be greater than 0");
    });

    it("rejects unparseable dimensions", () => {
        const o = {
            ...base,
            items: [{ ...base.items[0]!, dims: "10x8" }],
        };
        expectValidationError(
            () => validateCustomerOrder(o),
            "items[0].dims: Invalid dimension format: must be LxWxH",
        );
    });
});

describe("validateCustomerOrder — success path", () => {
    it("does not throw for a fully valid order", () => {
        expect(() => validateCustomerOrder(base)).not.toThrow();
    });

    it("matches transformOrder precondition (validate then map)", () => {
        expect(() => transformOrder(base)).not.toThrow();
    });
});
