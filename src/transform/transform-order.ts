import type { CustomerOrder, ShipiumOrder } from "../domain/order-types";
import { ValidationError } from "../errors/validation-error";
import { mapCustomerOrderToShipium } from "../mapping/oms-to-shipium";
import { validateCustomerOrder } from "../validation/validate-customer-order";

/**
 * Validates first, then maps (never assumes input is valid). Use {@link mapCustomerOrderToShipium}
 * only when you already trust the order (e.g. golden-path tests without edge-case guards).
 */
export function transformOrder(input: CustomerOrder): ShipiumOrder {
    validateCustomerOrder(input);
    return mapCustomerOrderToShipium(input);
}

export function transformOrders(orders: CustomerOrder[]): {
    successful: ShipiumOrder[];
    failed: Array<{ order: CustomerOrder; error: Error }>;
} {
    const successful: ShipiumOrder[] = [];
    const failed: Array<{ order: CustomerOrder; error: Error }> = [];

    for (const order of orders) {
        try {
            successful.push(transformOrder(order));
        } catch (e) {
            const err = e instanceof Error ? e : new ValidationError(String(e));
            failed.push({ order, error: err });
        }
    }

    return { successful, failed };
}
