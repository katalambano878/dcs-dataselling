import "server-only";

import {
  isRailwayExternalConfigured,
  pingSupplier,
  submitBulkOrders,
  submitSingleOrder,
} from "./railway-external";
import type {
  SupplierClient,
  SupplierSubmitBulkParams,
  SupplierSubmitResult,
  SupplierSubmitSingleParams,
} from "./types";

export const railwayExternalClient: SupplierClient = {
  id: "railwayexternal",
  label: "Railway API",
  isConfigured: () => isRailwayExternalConfigured(),

  async submitSingle(params: SupplierSubmitSingleParams): Promise<SupplierSubmitResult> {
    const r = await submitSingleOrder({
      network: params.network,
      msisdn: params.msisdn,
      volumeMb: params.volumeMb,
      reference: params.reference,
      scope: params.scope,
    });
    if (!r.ok) {
      return { ok: false, error: r.error, httpStatus: r.status, rawResponse: r.data };
    }
    return {
      ok: true,
      reference: r.data.reference,
      orderCode: r.data.orderId,
      status: r.data.status,
      orders: r.data.items.map((it) => ({
        order_code: r.data.orderId,
        msisdn: it.mobileNumber,
        status: it.status,
      })),
      rawResponse: r.data,
      httpStatus: r.status,
    };
  },

  async submitBulk(params: SupplierSubmitBulkParams): Promise<SupplierSubmitResult> {
    const r = await submitBulkOrders({
      network: params.network,
      recipients: params.recipients,
      reference: params.reference,
      scope: params.scope,
    });
    if (!r.ok) {
      return { ok: false, error: r.error, httpStatus: r.status, rawResponse: r.data };
    }
    return {
      ok: true,
      reference: r.data.reference,
      status: "Pending",
      orders: r.data.orders,
      rawResponse: r.data,
      httpStatus: r.status,
    };
  },

  async ping() {
    const r = await pingSupplier();
    return {
      ok: r.ok,
      error: r.ok ? undefined : r.error,
      raw: r.ok ? r.data : r.data,
    };
  },
};
