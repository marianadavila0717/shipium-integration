import type { CustomerOrder, ShipiumOrder } from "../domain/order-types";
import { ouncesToPounds } from "../conversion/weight";
import { parseDimensions } from "../parsing/dimensions";
import { trimStr } from "../utils/strings";

/**
 * Phase 1 — Field mapping (OMS → Shipium) + conversions, for one already-validated order.
 *
 * Mapping table:
 * - orderNumber              → external_order_id
 * - orderDate                → order_placed_ts
 * - customer.fullName        → destination_address.name
 * - customer.shippingAddr.*  → destination_address.* (zip → postal_code)
 * - items[].sku              → items[].external_line_item_id
 * - items[].description      → items[].description
 * - items[].qty              → items[].quantity
 * - items[].weight_oz        → items[].weight (value in lb, unit lb)
 * - items[].dims             → items[].dimensions (parsed L×W×H, unit in)
 * - shipFromWarehouse        → origin_address.facility_alias
 * - serviceLevel             → ship_option.service_level (normalized uppercase)
 */
export function mapCustomerOrderToShipium(order: CustomerOrder): ShipiumOrder {
    const orderNumber = trimStr(order.orderNumber)!;
    const orderDate = trimStr(order.orderDate)!;
    const customer = order.customer;
    const address = customer.shippingAddr;

    const fullName = trimStr(customer.fullName)!;
    const street1 = trimStr(address.street1)!;
    const street2 = trimStr(address.street2);
    const city = trimStr(address.city)!;
    const state = trimStr(address.state)!;
    const zip = trimStr(address.zip)!;
    const country = trimStr(address.country)!.toUpperCase();

    const shipFromWarehouse = trimStr(order.shipFromWarehouse)!;
    const serviceLevel = trimStr(order.serviceLevel)!.toUpperCase();

    const destination: ShipiumOrder["destination_address"] = {
        name: fullName,
        street1,
        city,
        state,
        postal_code: zip,
        country,
    };
    if (street2 !== undefined) {
        destination.street2 = street2;
    }

    const items: ShipiumOrder["items"] = order.items.map((item) => {
        const sku = trimStr(item.sku)!;
        const description = trimStr(item.description)!;
        const qty = item.qty;
        const weightOz = item.weight_oz;

        return {
            external_line_item_id: sku,
            description,
            quantity: qty,
            weight: {
                value: ouncesToPounds(weightOz),
                unit: "lb" as const,
            },
            dimensions: parseDimensions(item.dims),
        };
    });

    return {
        external_order_id: orderNumber,
        order_placed_ts: orderDate,
        destination_address: destination,
        items,
        origin_address: {
            facility_alias: shipFromWarehouse,
        },
        ship_option: {
            service_level: serviceLevel,
        },
    };
}
