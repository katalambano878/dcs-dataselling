import "server-only";

import {
  isIshareConfigured,
  pingSupplier,
  submitBulkOrders,
  submitSingleOrder,
} from "./ishare";
import type {
  SupplierClient,
  SupplierSubmitBulkParams,
  SupplierSubmitResult,
  SupplierSubmitSingleParams,
} from "./types";

export const ishareClient: SupplierClient = {
  id: "ishare",
  label: "iShare (MultiData)",
  isConfigured: () => isIshareConfigured(),

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
      orderCode: r.data.reference,
      status: r.data.status,
      orders: [
        {
          order_code: r.data.reference,
          msisdn: params.msisdn,
          status: r.data.deliveryStatus,
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
      status: "delivered",
      orders: r.data.orders,
      rawResponse: r.data,
      httpStatus: r.status,
    };
  },

  async ping() {
    const r = await pingSupplier();
    return {
      ok: r.ok && r.data.status === "200",
      error: r.ok ? undefined : r.error,
      raw: r.ok ? r.data : r.data,
    };
  },
};
