# Shipium OMS → API order transformation

TypeScript service that maps a customer **Order Management System (OMS)** order (`CustomerOrder`) to **Shipium’s** order payload (`ShipiumOrder`), including unit conversions, validation, and batch handling.

This README includes: **[how to run the code](#how-to-run-the-code)**, **[how to run tests](#how-to-run-tests)**, **[key design decisions](#key-design-decisions)**, and **[assumptions](#assumptions-made-during-implementation)**.

Full **Scenario 4 scoring breakdown** (Parts A–E, batch bonus, grading scale): see **[`evaluation_rubric.md`](./evaluation_rubric.md)**.

### Mapping this submission to the rubric

| Area | Weight | How it is addressed in this repo |
|------|--------|----------------------------------|
| **Correctness** (transformation & conversions) | 30% | `src/mapping/oms-to-shipium.ts`, `src/conversion/weight.ts`, `src/parsing/dimensions.ts`; fixtures in `tests/fixtures/` |
| **Validation** | 20% | `src/validation/validate-customer-order.ts`, `src/errors/validation-error.ts`; field names in error messages |
| **Edge cases** | 20% | Optional `street2`/email, trims, decimal oz, spaced dims, US/CA postal, invalid data → throws; `sample_orders.json` + `edge_cases.json` in `order-transformation.integration.test.ts` |
| **Testing** | 20% | `tests/*.test.ts` (79 cases); `npm run test:coverage` typically **>90%** on `src/**/*.ts` (barrel excluded) |
| **Code quality** | 10% | Layered `src/` layout, TypeScript interfaces in `src/domain/order-types.ts`, README + module comments |
| **Batch (bonus)** | +10 | `transformOrders` in `src/transform/transform-order.ts`; tested in `order-transformation.integration.test.ts` |

---

## Key requirements (scenario checklist)

### Core transformation — field mappings

| Customer OMS | Shipium API | Implementation |
|--------------|-------------|----------------|
| `orderNumber` | `external_order_id` | `mapping/oms-to-shipium` (`mapCustomerOrderToShipium`) |
| `orderDate` | `order_placed_ts` | same |
| `customer.fullName` | `destination_address.name` | same |
| `customer.shippingAddr.*` | `destination_address.*` | `street1`, `city`, `state`, `country`; `zip` → `postal_code`; optional `street2` |
| `items[].sku` | `items[].external_line_item_id` | same |
| `items[].description` | `items[].description` | same (required by OMS type) |
| `items[].qty` | `items[].quantity` | same |
| `items[].weight_oz` | `items[].weight.value` (+ `unit: "lb"`) | `ouncesToPounds` |
| `items[].dims` | `items[].dimensions` | `parsing/dimensions` (`parseDimensions` / `parseDimensionString`) |
| `shipFromWarehouse` | `origin_address.facility_alias` | same |
| `serviceLevel` | `ship_option.service_level` | trimmed, uppercased |

### Unit conversions

| Rule | Implementation |
|------|----------------|
| Weight: ounces ÷ 16 → pounds | `ouncesToPounds` |
| Dimensions: `"10x8x6"` (and spaced variants) → `{ length, width, height, unit: "in" }` | `parseDimensions` |

### Validation

| Requirement | Where |
|-------------|--------|
| Order number | `validation/validate-customer-order` (`validateCustomerOrder`) |
| Customer name | `customer.fullName` |
| Complete shipping address (required line fields + country + postal rules for US/CA) | `validateCustomerOrder` |
| At least one item | non-empty `items[]` |
| Each item: SKU, quantity, weight, dimensions | per-line checks + `parseDimensions` for `dims` |
| Quantities: positive integers | `qty` finite, `> 0`, `Number.isInteger` |
| Weights: positive numbers | `weight_oz` finite, `> 0` |
| Dimensions: positive numbers | enforced in `parsing/dimensions` |
| Email (basic), when present | `validateEmail` + regex |

### Edge cases

| Topic | Covered by |
|-------|------------|
| Optional `street2`, `email` | Omitted when missing; email optional; `sample_orders.json` + `order-transformation.integration.test.ts` |
| Dimension spacing `"10 x 8 x 6"` | `parseDimensions` in `parsing/dimensions` |
| Decimal ounces (e.g. 12.5 oz) | `ouncesToPounds` |
| Very small / large weights | `edge_cases.json`, `sample_orders.json` |
| Invalid dimensions `10x8`, `axbxc` | validation + `order-transformation.integration.test.ts` / scenario fixtures |
| Negative values | `validate-customer-order.test.ts`, `order-transformation.integration.test.ts` (negative `weight_oz`) |
| International addresses (e.g. CA, postal code) | `validatePostalCode` + Canadian samples |

### Testing

| Requirement | Status |
|-------------|--------|
| Successful transformations | `order-transformation.integration.test.ts`, `scenario_4_test_cases.json`, `sample_orders.json` |
| Weight conversions | `sample_orders.json` + helper parity checks in `order-transformation.integration.test.ts` |
| Dimension parsing | Same file + dimension fixtures |
| Validation errors | `validate-customer-order.test.ts`, `scenario_4_test_cases.json` |
| Edge cases | `edge_cases.json` + `sample_orders.json` in `order-transformation.integration.test.ts` |
| **> 90% code coverage** (implementation under `src/`, excluding `index.ts` barrel) | **Yes** — run `npm run test:coverage` |

---

## How to run the code

1. **Install dependencies** (from the repository root):

   ```bash
   npm install
   ```

2. **Typecheck** the project (no JavaScript is emitted unless you enable `outDir` in `tsconfig.json`):

   ```bash
   npx tsc --noEmit
   ```

3. **Use the module** as a library: there is no HTTP server or `npm start` script. Import the public API from `src/index.ts` in your application or tests, for example:

   ```ts
   import { transformOrder, type CustomerOrder } from "./src/index";
   ```

   Adjust the import path for your project layout, module resolution (`package.json` `"exports"`, path aliases), or emitted `.js` files. Main entry points are listed under [Assessment roadmap → this repo](#assessment-roadmap--this-repo) (`transformOrder`, `validateCustomerOrder`, `mapCustomerOrderToShipium`, `transformOrders`).

---

## How to run tests

| Command | Purpose |
|--------|---------|
| `npm test` | Run the full Jest suite (all files under `tests/`) |
| `npm run test:coverage` | Same as above, plus Istanbul coverage under `coverage/` |
| `npx jest tests/validate-customer-order.test.ts` | Run a single test file (swap the path for others) |

After `npm run test:coverage`, open `coverage/lcov-report/index.html` in a browser for a line-by-line report (optional).

---

## Assessment roadmap → this repo

| Phase | Goal | Where it lives |
|-------|------|----------------|
| **1 — Basic transformation** | Field mapping; one complete order without edge-case focus | `mapCustomerOrderToShipium()`, `order-transformation.integration.test.ts` (“Phase 1”) |
| **2 — Conversions** | oz → lb; `dims` string → L×W×H inches | `conversion/weight`, `parsing/dimensions`; `order-transformation.integration.test.ts` (`sample_orders.json` with one `transformOrder` per row) |
| **3 — Validation** | Required fields, formats, business rules | `validateCustomerOrder()`; `validate-customer-order.test.ts` |
| **4 — Edge cases** | Optional fields, bad data, spacing/case/decimal weights | `utils/strings` (`trimStr`), optional `street2`/`email`, etc.; `edge_cases.json` + `sample_orders.json` in `order-transformation.integration.test.ts` |
| **5 — Polish** | Structure, docs, test review | This README; `src/index.ts`; batch `transformOrders()` in `transform/transform-order.ts` |

Public entry points:

- **`transformOrder(order)`** — validate, then map (use for production OMS input).
- **`mapCustomerOrderToShipium(order)`** — map only (trusted / golden-path data).
- **`validateCustomerOrder(order)`** — validate only (e.g. preflight).
- **`transformOrders(orders)`** — batch; collects successes and failures.

---

## Project layout

```
src/
  index.ts                     # Public API (re-exports)
  domain/order-types.ts        # CustomerOrder, ShipiumOrder
  errors/validation-error.ts
  utils/strings.ts             # trimStr (normalization)
  conversion/weight.ts         # oz → lb
  parsing/dimensions.ts        # L×W×H string parsing
  mapping/oms-to-shipium.ts    # OMS → Shipium field mapping
  validation/validate-customer-order.ts
  transform/transform-order.ts # validate + map; batch transformOrders

tests/
  fixtures/                    # Scenario 4 JSON (self-contained repo)
  order-transformation.integration.test.ts   # samples, scenario cases, edge_cases, batch (single transform per fixture row where practical)
  validate-customer-order.test.ts          # validation matrix
```

---

## Key design decisions

- **Pipeline:** `validateCustomerOrder` → `mapCustomerOrderToShipium`. Separation keeps mapping testable without repeating guards.
- **Normalization:** Trim string fields; uppercase `country` and `service_level`; omit optional `street2` when absent or whitespace-only.
- **Weight:** Pounds = ounces ÷ 16 (floating point; no artificial rounding).
- **Dimensions:** Split on `x` (case-insensitive), trim segments; supports spaces and tab characters between parts.
- **Errors:** `ValidationError` with stable messages used by fixtures.
- **Batch:** `transformOrders` never stops on first failure; returns `{ successful, failed }`.

### Common pitfalls avoided

| Pitfall | Approach in this repo |
|--------|------------------------|
| Skipping validation or deferring it | `transformOrder` always runs `validateCustomerOrder` first; mapping-only API is explicit (`mapCustomerOrderToShipium` for trusted data). |
| Vague error messages | Errors use field paths where practical (`Missing required field: …`, `items[n].qty`, …); see `validation/validate-customer-order.ts`. |
| Ignoring edge cases in tests | `edge_cases.json`, `sample_orders.json`, and scenario fixtures in `order-transformation.integration.test.ts`. |
| Assuming inputs are always valid | Runtime checks for nullish order, missing nested objects, types, formats, and business rules before mapping. |
| Over-engineering | Simple modules (`conversion/weight.ts` is one formula); complexity only where needed (validation split from mapping). |
| Integer division for weight | `ouncesToPounds` uses floating-point `ounces / 16` (see `conversion/weight.ts`). |

### Practices followed

| Practice | How it is applied |
|----------|-------------------|
| **Validate early** | `transformOrder` runs `validateCustomerOrder` before any mapping; validation checks root → header → customer → address → items in order. |
| **Field names in errors** | Messages include paths such as `items[n].qty`, `items[n].weight_oz`, `items[n].dims: …`, `customer.email` where relevant (`validation/validate-customer-order.ts`). |
| **Optional fields** | `street2` omitted when absent; `email` validated only when present (`mapping/oms-to-shipium.ts`, validation). |
| **Test success and failure** | `tests/*.test.ts` cover happy paths, validation errors, conversions, and edge fixtures. |
| **Document complex logic** | JSDoc on `index.ts`, mapping, validation, dimensions, weight; this README for setup and design. |
| **Decimal weight division** | `ounces / 16` with floating-point semantics (`conversion/weight.ts`). |

---

## Assumptions made during implementation

- `orderDate` is ISO 8601 and includes a timezone (`Z` or numeric offset).
- `requestedShipDate` is `YYYY-MM-DD` per the assessment examples.
- `country` is ISO 3166-1 alpha-2; US/CA postal formats are validated; other countries only require non-empty postal strings.
- Shipium payload does not include OMS-only fields (e.g. `custId`, `requestedShipDate`, customer email) unless the API spec is extended.
- `dims` order is length × width × height in inches, as provided by the customer.

---

## Test suite review (Phase 5)

| File | Role |
|------|------|
| `order-transformation.integration.test.ts` | End-to-end against `sample_orders.json`, structured `scenario_4_test_cases.json`, `edge_cases.json`, conversion checks, batch |
| `validate-customer-order.test.ts` | Focused validation matrix (`validateCustomerOrder` / `transformOrder`) |

Run a subset:

- `npx jest tests/order-transformation.integration.test.ts` — integration / fixtures / batch  
- `npx jest tests/validate-customer-order.test.ts` — Phase 3 only  

---

## Known limitations

- No HTTP client; this is pure transformation.
- Phone numbers from the broader spec are not modeled on `CustomerOrder`.
- Service-level values are normalized to uppercase; they are not validated against a configured allowlist.
