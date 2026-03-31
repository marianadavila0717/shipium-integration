/**
 * Uses the assessment JSON bundles (same content as Scenario 4 `scenario_4_sample_orders.json`
 * and `scenario_4_edge_cases.json`). Copies live under `tests/fixtures/` so the repo stays self-contained.
 *
 * `scenario_4_test_cases.json` in the Scenario 4 package is a **markdown** document with a misleading
 * `.json` extension. `tests/fixtures/scenario_4_test_cases.json` is valid JSON that mirrors that doc:
 * `test_case_structure` (field table), `description` on every case, `expected`/`expected_error` as in the
 * spec, `weight_conversion.various_weights.testCases` with per-row **`note`** (Test 5 table), etc.
 */
import edgeData from "./fixtures/edge_cases.json";
import sampleData from "./fixtures/sample_orders.json";
import scenarioTestCases from "./fixtures/scenario_4_test_cases.json";
import type { CustomerOrder, ShipiumOrder } from "../src";
import {
    mapCustomerOrderToShipium,
    ouncesToPounds,
    parseDimensionString,
    transformOrder,
    transformOrders,
    ValidationError,
} from "../src";
import * as validateCustomerOrderModule from "../src/validation/validate-customer-order";

type SampleEntry = {
    name: string;
    order: CustomerOrder;
    expected_output?: ShipiumOrder;
    note?: string;
};

type EdgeEntry = {
    case_name: string;
    order: CustomerOrder;
    expected_behavior: string;
};

/** Mirrors `tests/fixtures/scenario_4_test_cases.json` (aligned with Scenario 4 markdown spec). */
type ScenarioFixture = {
    test_case_structure: {
        description: string;
        fields: Array<{ field: string; role: string }>;
    };
    happy_path: Array<{
        name: string;
        description: string;
        input: CustomerOrder;
        expected: ShipiumOrder;
        note?: string;
    }>;
    weight_conversion: {
        decimal_ounces_to_pounds: {
            name: string;
            description: string;
            input: CustomerOrder;
            expected: { items: Array<{ weight: { value: number; unit: "lb" } }> };
            note: string;
        };
        various_weights: {
            description: string;
            testCases: Array<{ input_weight_oz: number; expected_weight_lb: number; note: string }>;
            base_order: CustomerOrder;
        };
    };
    dimension_parsing: {
        parses_dimensions_with_spaces: {
            name: string;
            description: string;
            testCases: Array<{
                input: string;
                expected: { length: number; width: number; height: number; unit: "in" };
            }>;
            base_order: CustomerOrder;
        };
    };
    validation_errors: Array<{
        name: string;
        description: string;
        input: unknown;
        expected_error: { message: string; type: string };
    }>;
    invalid_dimensions: {
        name: string;
        description: string;
        testCases: Array<{ input_dims: string; expected_error: string }>;
        base_order: CustomerOrder;
    };
    invalid_email: {
        name: string;
        description: string;
        testCases: Array<{ input_email: string; expected_error: string }>;
        base_order: CustomerOrder;
    };
    edge_cases: {
        canadian_address: {
            name: string;
            description: string;
            input: CustomerOrder;
            expected: { destination_address: { state: string; postal_code: string; country: string } };
            note: string;
        };
        fractional_ounce_weight: {
            name: string;
            description: string;
            input_weight_oz: number;
            expected_weight_lb: number;
            note: string;
            base_order: CustomerOrder;
        };
        large_weight: {
            name: string;
            description: string;
            input_weight_oz: number;
            expected_weight_lb: number;
            note: string;
            base_order: CustomerOrder;
        };
    };
};

function cloneOrder(o: CustomerOrder): CustomerOrder {
    return JSON.parse(JSON.stringify(o)) as CustomerOrder;
}

/** One fully-populated OMS order (valid data) — Phase 1 mapping target. */
const oneCompleteOrder: CustomerOrder = {
    orderNumber: "ORD-2026-001",
    orderDate: "2026-01-15T10:30:00Z",
    customer: {
        custId: "CUST-123",
        fullName: "John Smith",
        email: "john.smith@example.com",
        shippingAddr: {
            street1: "123 Main St",
            street2: "Apt 4",
            city: "Seattle",
            state: "WA",
            zip: "98101",
            country: "US",
        },
    },
    items: [
        {
            sku: "PROD-001",
            description: "Blue Widget",
            qty: 2,
            weight_oz: 16,
            dims: "10x8x6",
        },
    ],
    shipFromWarehouse: "DC-WEST-01",
    requestedShipDate: "2026-01-16",
    serviceLevel: "GROUND",
};

describe("Phase 1 — simple field mapping (one complete order, no edge-case focus)", () => {
    it("mapCustomerOrderToShipium maps a trusted order to the Shipium shape", () => {
        const mapped = mapCustomerOrderToShipium(oneCompleteOrder);
        expect(mapped.external_order_id).toBe("ORD-2026-001");
        expect(mapped.order_placed_ts).toBe("2026-01-15T10:30:00Z");
        expect(mapped.destination_address.name).toBe("John Smith");
        expect(mapped.destination_address.postal_code).toBe("98101");
        expect(mapped.items[0]!.external_line_item_id).toBe("PROD-001");
        expect(mapped.items[0]!.weight).toEqual({ value: 1, unit: "lb" });
        expect(mapped.items[0]!.dimensions).toEqual({
            length: 10,
            width: 8,
            height: 6,
            unit: "in",
        });
        expect(mapped.origin_address.facility_alias).toBe("DC-WEST-01");
        expect(mapped.ship_option.service_level).toBe("GROUND");
    });

    it("transformOrder matches pure mapping when the order is already valid", () => {
        expect(transformOrder(oneCompleteOrder)).toEqual(mapCustomerOrderToShipium(oneCompleteOrder));
    });
});

function assertSampleWithoutExpected(sample: SampleEntry, result: ShipiumOrder): void {
    const { name } = sample;
    switch (name) {
        case "Missing Optional Fields": {
            expect(sample.order.customer.email).toBeUndefined();
            expect(result.destination_address.street2).toBeUndefined();
            expect(result.destination_address.city).toBe("San Francisco");
            expect(result.items[0]!.external_line_item_id).toBe("ITEM-XYZ");
            expect(result.items[0]!.weight.value).toBe(20 / 16);
            break;
        }
        case "Decimal Weight": {
            expect(result.items[0]!.weight.value).toBe(12.5 / 16);
            break;
        }
        case "Dimensions with Spaces": {
            const d = result.items[0]!.dimensions;
            expect(d.length).toBe(20);
            expect(d.width).toBe(16);
            expect(d.height).toBe(12);
            break;
        }
        case "Canadian Address": {
            expect(result.destination_address.postal_code).toBe("M5B 2H1");
            expect(result.destination_address.country).toBe("CA");
            expect(result.destination_address.state).toBe("ON");
            break;
        }
        case "Heavy Item": {
            expect(result.items[0]!.weight.value).toBe(320 / 16);
            break;
        }
        case "Small Dimensions": {
            expect(result.items[0]!.weight.value).toBe(2 / 16);
            const d = result.items[0]!.dimensions;
            expect(d.length).toBe(2);
            expect(d.width).toBe(2);
            expect(d.height).toBe(1);
            break;
        }
        case "Mixed Case and Whitespace": {
            expect(result.external_order_id).toBe("ORD-2026-009");
            expect(result.destination_address.country).toBe("US");
            expect(result.items[0]!.external_line_item_id).toBe("MESSY-DATA");
            break;
        }
        case "Multiple Quantities": {
            expect(result.items[0]!.quantity).toBe(10);
            break;
        }
        default: {
            throw new Error(`No assertions for sample_orders case: ${name}`);
        }
    }
}

/**
 * One `transformOrder` per row: weight/dims parity with pure helpers, optional full golden `expected_output`,
 * otherwise `assertSampleWithoutExpected` (replaces separate Phase 2 + duplicate Scenario 4 loops).
 */
describe("sample_orders.json — conversion, parsing, and golden output", () => {
    const samples = sampleData.sample_orders as SampleEntry[];

    it.each(samples.map((s) => [s.name, s] as const))("%s", (_title, sample) => {
        const result = transformOrder(sample.order);
        sample.order.items.forEach((line, idx) => {
            expect(ouncesToPounds(line.weight_oz)).toBe(result.items[idx]!.weight.value);
            expect(result.items[idx]!.weight).toEqual({
                value: ouncesToPounds(line.weight_oz),
                unit: "lb",
            });
            expect(parseDimensionString(line.dims)).toEqual(result.items[idx]!.dimensions);
        });
        if (sample.expected_output !== undefined) {
            expect(result).toEqual(sample.expected_output);
        } else {
            assertSampleWithoutExpected(sample, result);
        }
    });

    it("rejects negative line-item weight (invariant beyond fixture rows)", () => {
        const base = samples.find((s) => s.name === "Simple Order - Single Item")!;
        const bad: CustomerOrder = {
            ...base.order,
            items: [{ ...base.order.items[0]!, weight_oz: -1 }],
        };
        expect(() => transformOrder(bad)).toThrow("items[0].weight_oz: Weight must be greater than 0");
    });
});

describe("Scenario 4 — scenario_4_test_cases (markdown spec, structured JSON fixture)", () => {
    const tc = scenarioTestCases as unknown as ScenarioFixture;

    it("documents test case field layout (name, description, input, expected, …)", () => {
        expect(tc.test_case_structure.fields.map((f) => f.field)).toEqual(
            expect.arrayContaining(["name", "description"]),
        );
    });

    it.each(tc.happy_path.map((h) => [h.name, h] as const))("%s", (_n, row) => {
        expect(transformOrder(row.input)).toEqual(row.expected);
    });

    it(tc.weight_conversion.decimal_ounces_to_pounds.name, () => {
        const block = tc.weight_conversion.decimal_ounces_to_pounds;
        const result = transformOrder(block.input);
        expect(result.items[0]!.weight).toEqual(block.expected.items[0]!.weight);
    });

    it.each(
        tc.weight_conversion.various_weights.testCases.map((w) => [w.note, w.input_weight_oz, w.expected_weight_lb] as const),
    )("%s", (_note, oz, lb) => {
        const order = cloneOrder(tc.weight_conversion.various_weights.base_order);
        order.items[0]!.weight_oz = oz;
        expect(transformOrder(order).items[0]!.weight.value).toBe(lb);
    });

    it.each(
        tc.dimension_parsing.parses_dimensions_with_spaces.testCases.map((d) => [d.input, d.expected] as const),
    )("parses dimensions: %s", (dims, expected) => {
        const order = cloneOrder(tc.dimension_parsing.parses_dimensions_with_spaces.base_order);
        order.items[0]!.dims = dims;
        expect(transformOrder(order).items[0]!.dimensions).toEqual(expected);
    });

    it.each(tc.validation_errors.map((v) => [v.name, v] as const))("%s", (_n, row) => {
        try {
            transformOrder(row.input as CustomerOrder);
            throw new Error("expected validation to throw");
        } catch (e) {
            if (e instanceof Error && e.message === "expected validation to throw") throw e;
            expect(e).toBeInstanceOf(ValidationError);
            expect((e as Error).message).toBe(row.expected_error.message);
            expect((e as Error).name).toBe(row.expected_error.type);
        }
    });

    it.each(tc.invalid_dimensions.testCases.map((s) => [s.input_dims, s.expected_error] as const))(
        "invalid dims %j",
        (dims, msg) => {
            const order = cloneOrder(tc.invalid_dimensions.base_order);
            order.items[0]!.dims = dims;
            expect(() => transformOrder(order)).toThrow(msg);
        },
    );

    it.each(tc.invalid_email.testCases.map((s) => [s.input_email, s.expected_error] as const))(
        "invalid email %j",
        (email, msg) => {
            const order = cloneOrder(tc.invalid_email.base_order);
            order.customer.email = email;
            expect(() => transformOrder(order)).toThrow(msg);
        },
    );

    it(tc.edge_cases.canadian_address.name, () => {
        const c = tc.edge_cases.canadian_address;
        const result = transformOrder(c.input);
        expect(result.destination_address).toMatchObject(c.expected.destination_address);
    });

    it(tc.edge_cases.fractional_ounce_weight.name, () => {
        const b = tc.edge_cases.fractional_ounce_weight;
        const order = cloneOrder(b.base_order);
        order.items[0]!.weight_oz = b.input_weight_oz;
        expect(transformOrder(order).items[0]!.weight.value).toBe(b.expected_weight_lb);
    });

    it(tc.edge_cases.large_weight.name, () => {
        const b = tc.edge_cases.large_weight;
        const order = cloneOrder(b.base_order);
        order.items[0]!.weight_oz = b.input_weight_oz;
        expect(transformOrder(order).items[0]!.weight.value).toBe(b.expected_weight_lb);
    });
});

describe("Scenario 4 — edge_cases.json (from assessment materials)", () => {
    const edges = edgeData.edge_cases as EdgeEntry[];

    it.each(
        edges.map((e) => [e.case_name, e] as const),
    )("%s", (_title, edge) => {
        const behavior = edge.expected_behavior;

        if (
            behavior.includes("Should transform successfully") ||
            behavior.includes("Should parse successfully") ||
            behavior.includes("Should trim all whitespace")
        ) {
            const result = transformOrder(edge.order);
            if (edge.case_name === "Very Large Weight (Edge of Reasonable)") {
                expect(result.items[0]!.weight.value).toBe(9600 / 16);
            }
            if (edge.case_name === "Very Small Weight (Fractional Ounces)") {
                expect(result.items[0]!.weight.value).toBe(0.5 / 16);
            }
            if (edge.case_name.includes("Dimension String")) {
                const d = result.items[0]!.dimensions;
                expect(d.length).toBe(10);
                expect(d.width).toBe(8);
                expect(d.height).toBe(6);
            }
            if (edge.case_name === "All String Fields with Leading/Trailing Whitespace") {
                expect(result.external_order_id).toBe("ORD-EDGE-014");
                expect(result.destination_address.street1).toBe("123 Test St");
                expect(result.destination_address.country).toBe("US");
                expect(result.items[0]!.external_line_item_id).toBe("TEST-001");
            }
            return;
        }

        if (behavior.includes("Should throw") || behavior.includes("throw error")) {
            if (edge.case_name === "Invalid Dimension Format - Only Two Numbers") {
                expect(() => transformOrder(edge.order)).toThrow(
                    "items[0].dims: Invalid dimension format: must be LxWxH",
                );
            } else if (edge.case_name === "Invalid Dimension Format - Not Numbers") {
                expect(() => transformOrder(edge.order)).toThrow(
                    "items[0].dims: Invalid dimension format: dimensions must be numbers",
                );
            } else if (edge.case_name === "Decimal Quantity (Should Fail)") {
                expect(() => transformOrder(edge.order)).toThrow(
                    "items[0].qty: Quantity must be a positive integer",
                );
            } else if (edge.case_name === "Invalid Email Format") {
                try {
                    transformOrder(edge.order);
                    throw new Error("expected Invalid Email Format to throw");
                } catch (e) {
                    if (e instanceof Error && e.message === "expected Invalid Email Format to throw") throw e;
                    expect(e).toBeInstanceOf(ValidationError);
                    expect((e as Error).message).toBe("Invalid email format for customer.email");
                }
            } else {
                expect(() => transformOrder(edge.order)).toThrow(ValidationError);
            }
            return;
        }

        throw new Error(`Unhandled edge case: ${edge.case_name}`);
    });
});

describe("transformOrders (batch)", () => {
    const samples = sampleData.sample_orders as SampleEntry[];
    const firstValid = samples.find((s) => s.expected_output !== undefined)!;

    it("collects successes and failures without stopping", () => {
        const bad: CustomerOrder = {
            ...firstValid.order,
            orderNumber: "BAD-BATCH",
            items: [],
        };
        const { successful, failed } = transformOrders([firstValid.order, bad]);
        expect(successful).toHaveLength(1);
        expect(failed).toHaveLength(1);
        const firstFail = failed[0]!;
        expect(firstFail.error).toBeInstanceOf(Error);
        expect(firstFail.error.message).toContain("at least one item");
    });

    it("wraps non-Error thrown values as ValidationError", () => {
        const spy = jest
            .spyOn(validateCustomerOrderModule, "validateCustomerOrder")
            .mockImplementation(() => {
                throw "non-error-throwable";
            });
        try {
            const { successful, failed } = transformOrders([firstValid.order]);
            expect(successful).toHaveLength(0);
            expect(failed).toHaveLength(1);
            expect(failed[0]!.error).toBeInstanceOf(ValidationError);
            expect(failed[0]!.error.message).toBe("non-error-throwable");
        } finally {
            spy.mockRestore();
        }
    });
});
