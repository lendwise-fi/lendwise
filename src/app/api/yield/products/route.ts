import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { type NextRequest, NextResponse } from "next/server";

import { syncProducts } from "@/app/actions/products-sync.actions";
import { getProtocolIds, type ProtocolName } from "@/config/protocols";

/**
 * Pools sync endpoint.
 *
 * Fetches static pool metadata (collaterals, protocolMeta, addresses)
 * from AAVE and Morpho and upserts into the pools collection.
 *
 * Body (JSON):
 *   protocol (optional): 'aave_v3' | 'morpho_v1'
 *   If omitted, all protocols are synced.
 *
 * Triggered by QStash once daily. Can be force-triggered by sending
 * a manual QStash message to this endpoint.
 */
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
	const body = await req.json().catch(() => ({}));
	const protocol = body.protocol as string | undefined;

	if (protocol) {
		const validIds = getProtocolIds() as string[];
		if (!validIds.includes(protocol)) {
			return NextResponse.json(
				{
					error: `Invalid protocol: "${protocol}". Supported: ${validIds.join(", ")}`,
				},
				{ status: 400 },
			);
		}
	}

	try {
		const result = await syncProducts(protocol as ProtocolName | undefined);

		return NextResponse.json(result, {
			status: result.success ? 200 : 207,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[cron:pools-sync] Unhandled error:", message);

		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
});
