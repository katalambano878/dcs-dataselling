import "server-only";

import {
  extractTransactionId,
  isShopDcsConfigured,
  pingSupplier,
  submitBulkOrders,
  submitSingleOrder,
} from "./shopdcs";
import type {
  SupplierClient,
  SupplierSubmitBulkParams,
  SupplierSubmitResult,
  SupplierSubmitSingleParams,
} from "./types";

export const shopDcsClient: SupplierClient = {
  id: "shopdcs",
  label: "Shop DCS (Telecel)",
  isConfigured: () => isShopDcsConfigured(),

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
    const txnId = extractTransactionId(r.data);
    return {
      ok: true,
      reference: txnId ?? params.reference,
      orderCode: txnId ?? undefined,
      status: r.data.status ?? "pending",
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
      ok: r.ok,
      error: r.ok ? undefined : r.error,
      raw: r.ok ? r.data : r.data,
    };
  },
};
