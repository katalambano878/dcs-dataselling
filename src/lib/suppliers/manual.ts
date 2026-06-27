import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type {
  SupplierClient,
  SupplierOrderScope,
  SupplierSubmitBulkParams,
  SupplierSubmitResult,
  SupplierSubmitSingleParams,
} from "./types";

/**
 * Manual fulfilment placeholder. Used for networks where we have not yet
 * integrated an automated upstream API.
 *
 * Behaviour:
 *  - Records an `awaiting_manual` event in supplier_logs so the order shows
 *    up on the admin supplier console.
 *  - Returns `manual: true` so the dispatcher leaves the order in `queued`
 *    state with supplier_status = "awaiting_manual" — NOT failed, NOT
 *    processing, NOT fulfilled. No SMS is sent until an admin acts.
 */
async function logManualEvent(args: {
  scope: SupplierOrderScope;
  reference: string;
  payload: unknown;
}) {
  if (!hasSupabaseConfig()) return;
  try {
    const service = createServiceClient();
    await service.from("supplier_logs").insert({
      supplier: "manual",
      event_type: "manual_pending",
      scope: args.scope,
      reference: args.reference,
      supplier_reference: null,
      http_status: null,
      ok: true,
      error: null,
      request_payload: args.payload as object,
      response_payload: null,
    });
  } catch (err) {
    console.error("[supplier_logs:manual] insert failed", err);
  }
}

export const manualClient: SupplierClient = {
  id: "manual",
  label: "Manual fulfilment (no automated supplier)",
  isConfigured: () => true, // always available — there's nothing to configure

  async submitSingle(params: SupplierSubmitSingleParams): Promise<SupplierSubmitResult> {
    await logManualEvent({
      scope: params.scope,
      reference: params.reference,
      payload: {
        network: params.network,
        msisdn: params.msisdn,
        volume_mb: params.volumeMb,
        note: "No automated supplier configured for this network. Fulfil manually from the admin supplier console.",
      },
    });
    return {
      ok: true,
      manual: true,
      status: "awaiting_manual",
    };
  },

  async submitBulk(params: SupplierSubmitBulkParams): Promise<SupplierSubmitResult> {
    await logManualEvent({
      scope: params.scope,
      reference: params.reference,
      payload: {
        network: params.network,
        recipients: params.recipients,
        note: "No automated supplier configured for this network. Fulfil manually from the admin supplier console.",
      },
    });
    return {
      ok: true,
      manual: true,
      status: "awaiting_manual",
    };
  },
};
