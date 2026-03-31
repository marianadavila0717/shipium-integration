/**
 * OMS → Shipium order transformation.
 *
 * - **Phase 1:** {@link mapCustomerOrderToShipium} — field mapping + conversions (trusted input).
 * - **Phase 2:** {@link ouncesToPounds}, {@link parseDimensionString} / internal `parseDimensions`.
 * - **Phase 3:** {@link validateCustomerOrder} — required fields, formats, business rules.
 * - **Phase 4:** Edge behavior (trim, optional `street2`/`email`, spacing in `dims`) lives in mapping/validation/parsing;
 *   covered in `tests/order-transformation.integration.test.ts` with `sample_orders.json` / `edge_cases.json`.
 * - **Phase 5:** {@link transformOrder} composes validate + map; {@link transformOrders} batch wrapper.
 */

export type { CustomerOrder, ShipiumOrder } from "./domain/order-types";
export { ValidationError } from "./errors/validation-error";
export { ouncesToPounds } from "./conversion/weight";
export { parseDimensionString } from "./parsing/dimensions";
export { mapCustomerOrderToShipium } from "./mapping/oms-to-shipium";
export { validateCustomerOrder } from "./validation/validate-customer-order";
export { transformOrder, transformOrders } from "./transform/transform-order";
