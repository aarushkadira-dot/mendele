"use server";

interface DiscoveryResult {
    success: boolean;
    message: string;
    newOpportunities?: number;
    opportunityIds?: string[];
}

interface BatchDiscoveryOptions {
    sources?: string[];
    focusAreas?: string[];
    limit?: number;
}

interface CacheStats {
    total_urls: number;
    by_status: Record<string, number>;
    pending_rechecks: number;
    top_domains: Array<{ domain: string; count: number }>;
}

export async function triggerDiscovery(
    query: string
): Promise<DiscoveryResult> {
    // Use the in-app web discovery pipeline (DuckDuckGo → crawl → Gemini extract → Supabase)
    // This replaces the old Python scraper backend which is no longer running.
    try {
        const { discoverOpportunities } = await import("@/app/actions/web-discovery")
        const result = await discoverOpportunities(query)
        return {
            success: result.success,
            message: result.message,
            newOpportunities: result.newOpportunities,
            opportunityIds: result.opportunityIds,
        }
    } catch (error) {
        console.error("Discovery error:", error)
        return {
            success: false,
            message: "Discovery failed. Please try again later.",
        }
    }
}

/**
 * Trigger batch discovery using multiple sources.
 */
export async function triggerBatchDiscovery(
    options: BatchDiscoveryOptions = {}
): Promise<DiscoveryResult> {
    const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://localhost:8080";
    const API_TOKEN = process.env.DISCOVERY_API_TOKEN;

    try {
        // Trigger the daily crawl endpoint as a proxy for batch discovery
        // Note: The main scraper's daily crawl might ignore options for now
        const response = await fetch(`${SCRAPER_API_URL}/discover/daily`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(API_TOKEN ? { "Authorization": `Bearer ${API_TOKEN}` } : {})
            },
            body: JSON.stringify({
                focusAreas: options.focusAreas,
                limit: options.limit || 100,
                sources: options.sources
            })
        });

        if (!response.ok) {
            return {
                success: false,
                message: "Batch discovery failed to start.",
            };
        }

        return {
            success: true,
            message: "Batch discovery started in background.",
            newOpportunities: 0, // Async process
        };
    } catch (e) {
        console.error("Batch discovery error:", e);
        return {
            success: false,
            message: "Failed to trigger batch discovery.",
        };
    }
}

/**
 * Get URL cache statistics.
 * Stubbed as main scraper manages state differently.
 */
export async function getCacheStats(): Promise<CacheStats | null> {
    return {
        total_urls: 0,
        by_status: {},
        pending_rechecks: 0,
        top_domains: []
    };
}

/**
 * Clear old cache entries.
 * Stubbed.
 */
export async function clearOldCacheEntries(days: number = 90): Promise<{ success: boolean; deleted: number }> {
    return { success: true, deleted: 0 };
}
