ALTER TABLE "apy_hourly" ALTER COLUMN "apy_base" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "apy_hourly" ALTER COLUMN "apy_fees" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "apy_daily" ALTER COLUMN "apy_base" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "apy_daily" ALTER COLUMN "apy_fees" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "apy_hourly" ADD COLUMN "available_liquidity" double precision;
--> statement-breakpoint
ALTER TABLE "apy_hourly" ADD COLUMN "available_liquidity_usd" double precision;
--> statement-breakpoint
ALTER TABLE "apy_hourly" ADD COLUMN "last_available_liquidity" double precision;
--> statement-breakpoint
ALTER TABLE "apy_hourly" ADD COLUMN "last_available_liquidity_usd" double precision;
--> statement-breakpoint
ALTER TABLE "apy_daily" ADD COLUMN "available_liquidity" double precision;
--> statement-breakpoint
ALTER TABLE "apy_daily" ADD COLUMN "available_liquidity_usd" double precision;
--> statement-breakpoint
UPDATE apy_hourly SET
  available_liquidity = supply_assets - supply_assets * LEAST(GREATEST(COALESCE(utilization_rate, 0), 0), 1),
  available_liquidity_usd = supply_assets_usd - supply_assets_usd * LEAST(GREATEST(COALESCE(utilization_rate, 0), 0), 1),
  last_available_liquidity = COALESCE(last_supply_assets, supply_assets) - COALESCE(last_supply_assets, supply_assets) * LEAST(GREATEST(COALESCE(last_utilization_rate, utilization_rate, 0), 0), 1),
  last_available_liquidity_usd = COALESCE(last_supply_assets_usd, supply_assets_usd) - COALESCE(last_supply_assets_usd, supply_assets_usd) * LEAST(GREATEST(COALESCE(last_utilization_rate, utilization_rate, 0), 0), 1);
--> statement-breakpoint
UPDATE apy_daily SET
  available_liquidity = supply_assets - supply_assets * LEAST(GREATEST(COALESCE(utilization_rate, 0), 0), 1),
  available_liquidity_usd = supply_assets_usd - supply_assets_usd * LEAST(GREATEST(COALESCE(utilization_rate, 0), 0), 1);
