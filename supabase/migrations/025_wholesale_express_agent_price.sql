-- Express Agent tier needs its own buy price (previously reused cost_price, so
-- admins had no field to set it). Add a dedicated column, default to cost_price.

ALTER TABLE wholesale_bundles
  ADD COLUMN IF NOT EXISTS express_agent_price DECIMAL(12, 2);

UPDATE wholesale_bundles
SET express_agent_price = COALESCE(express_agent_price, cost_price, ROUND(wholesale_price * 0.93, 2))
WHERE express_agent_price IS NULL;

COMMENT ON COLUMN wholesale_bundles.express_agent_price IS
  'Buy price for Express agents (admin-assigned tier). Defaults to cost_price.';
