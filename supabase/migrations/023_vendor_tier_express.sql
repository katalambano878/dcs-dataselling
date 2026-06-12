-- Express Agent tier: admin-assigned role with supplier (cost) buy pricing.
DO $$ BEGIN
  ALTER TYPE vendor_tier ADD VALUE IF NOT EXISTS 'express';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN vendors.tier IS 'Agent tier: starter=Agent, verified=Super Agent, pro=Pro Agent, express=Express Agent (supplier price)';
