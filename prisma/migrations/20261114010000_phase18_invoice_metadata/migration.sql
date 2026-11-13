-- Phase 18 delta: invoice metadata

ALTER TABLE "BillingInvoice" ADD COLUMN "metadata" JSONB;
