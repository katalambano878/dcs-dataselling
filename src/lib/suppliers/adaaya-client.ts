import "server-only";

import {
  isAdaayaConfigured,
  pingSupplier,
  submitBulkOrders,
  submitSingleOrder,
} from "./adaaya";
import type {
  SupplierClient,
  SupplierSubmitBulkParams,
  SupplierSubmitResult,
  SupplierSubmitSingleParams,
} from "./types";

export const adaayaClient: SupplierClient = {
  id: "adaaya",
  label: "Adaaya (AT / DCS External)",
  isConfigured: () => isAdaayaConfigured(),

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
      orders: [
        {
          order_code: r.data.orderId,
          msisdn: params.msisdn,
          status: r.data.status,
        },
      ],
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
      status: "pending",
      orders: r.data.orders,
      rawResponse: r.data,
      httpStatus: r.status,
    };
  },

  async ping() {
    const r = await pingSupplier();
    return {
      ok: r.ok && (r.data.status ?? "").toLowerCase() === "available",
      error: r.ok
        ? (r.data.status ?? "").toLowerCase() === "available"
          ? undefined
          : `Balance status: ${r.data.status}`
        : r.error,
      raw: r.ok ? r.data : r.data,
    };
  },
};
