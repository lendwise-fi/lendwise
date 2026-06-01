CREATE TABLE "apy_daily" (
	"product_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"apy_base" double precision NOT NULL,
	"apy_rewards" double precision NOT NULL,
	"apy_fees" double precision NOT NULL,
	"apy_net" double precision NOT NULL,
	"reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supply_assets" double precision,
	"supply_assets_usd" double precision,
	"utilization_rate" double precision,
	"asset_price_usd" double precision,
	"borrow_assets" double precision,
	"borrow_assets_usd" double precision,
	"collateral_assets_usd" double precision,
	"price_collateral_in_loan_asset" double precision,
	"quality_actual_count" integer NOT NULL,
	"quality_expected_count" integer DEFAULT 24 NOT NULL,
	"quality_completeness" double precision NOT NULL,
	"quality_status" text NOT NULL,
	"quality_revision" integer DEFAULT 0 NOT NULL,
	"quality_computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "apy_daily_product_id_date_pk" PRIMARY KEY("product_id","date")
);
--> statement-breakpoint
CREATE TABLE "apy_hourly" (
	"product_id" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"apy_base" double precision NOT NULL,
	"apy_rewards" double precision NOT NULL,
	"apy_fees" double precision NOT NULL,
	"apy_net" double precision NOT NULL,
	"reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supply_assets" double precision,
	"supply_assets_usd" double precision,
	"utilization_rate" double precision,
	"asset_price_usd" double precision,
	"borrow_assets" double precision,
	"borrow_assets_usd" double precision,
	"collateral_assets_usd" double precision,
	"price_collateral_in_loan_asset" double precision,
	"quality_count" integer NOT NULL,
	"quality_expected_count" integer DEFAULT 6 NOT NULL,
	"quality_first_slot" timestamp with time zone NOT NULL,
	"quality_last_slot" timestamp with time zone NOT NULL,
	"quality_status" text NOT NULL,
	"healed" boolean DEFAULT false NOT NULL,
	"heal_source" text,
	"healed_from" text,
	CONSTRAINT "apy_hourly_product_id_hour_pk" PRIMARY KEY("product_id","hour")
);
--> statement-breakpoint
CREATE TABLE "pipeline_reports" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"product_type" text NOT NULL,
	"version" text NOT NULL,
	"protocol_name" text NOT NULL,
	"chain_id" integer NOT NULL,
	"chain_name" text NOT NULL,
	"asset_symbol" text NOT NULL,
	"asset_name" text NOT NULL,
	"asset_address" text NOT NULL,
	"asset_decimals" integer NOT NULL,
	"protocol_address" text NOT NULL,
	"subgraph_url" text,
	"meta" jsonb NOT NULL,
	"collaterals" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "apy_daily_status_date" ON "apy_daily" USING btree ("quality_status","date");--> statement-breakpoint
CREATE INDEX "apy_hourly_hour" ON "apy_hourly" USING btree ("hour");--> statement-breakpoint
CREATE INDEX "pipeline_reports_type_created" ON "pipeline_reports" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "products_provider_asset_kind" ON "products" USING btree ("provider","asset_symbol","kind");--> statement-breakpoint
CREATE INDEX "products_name_asset_kind" ON "products" USING btree ("protocol_name","asset_symbol","kind");--> statement-breakpoint
CREATE INDEX "products_active_chain" ON "products" USING btree ("active","chain_id");