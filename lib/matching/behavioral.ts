/**
 * STAR Engine — Bayesian Behavioral Scoring
 *
 * Learns from the student's save/dismiss/apply history to boost or penalize
 * similar opportunities. Uses Bayesian posterior with Laplace smoothing so
 * new users get a uniform prior (neutral baseline).
 */

import { createAdminClient } from "@/lib/supabase/admin"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BehavioralProfile {
  /** category → count of saved/applied opportunities */
  positiveCategories: Map<string, number>
  /** type → count of saved/applied opportunities */
  positiveTypes: Map<string, number>
  /** organizations the user has positively engaged with */
  positiveOrgs: Set<string>
  /** category → count of dismissed opportunities */
  negativeCategories: Map<string, number>
  /** type → count of dismissed opportunities */
  negativeTypes: Map<string, number>
  /** total positive + negative actions (for Bayesian prior) */
  totalActions: number
  /** total positive actions only */
  totalPositive: number
  /** total negative actions only */
  totalNegative: number
}

interface OpportunityForScoring {
  category?: string | null
  type?: string | null
  company?: string | null
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

/**
 * Fetch the user's opportunity interaction history and build a behavioral profile.
 * Returns a BehavioralProfile with frequency maps for Bayesian scoring.
 */
export async function getBehavioralSignals(userId: string): Promise<BehavioralProfile> {
  const supabase = createAdminClient()

  // Fetch user_opportunities with joined opportunity data for category/type/company
  const { data, error } = await supabase
    .from("user_opportunities")
    .select(`
      status,
      opportunities!inner (
        category,
        type,
        company
      )
    `)
    .eq("user_id", userId)
    .in("status", ["saved", "applied", "dismissed"])

  if (error) {
    console.error("[Behavioral] Failed to fetch user opportunities:", error.message)
    return emptyProfile()
  }

  if (!data || data.length === 0) {
    return emptyProfile()
  }

  const profile: BehavioralProfile = {
    positiveCategories: new Map(),
    positiveTypes: new Map(),
    positiveOrgs: new Set(),
    negativeCategories: new Map(),
    negativeTypes: new Map(),
    totalActions: 0,
    totalPositive: 0,
    totalNegative: 0,
  }

  for (const row of data) {
    const opp = (row as any).opportunities
    if (!opp) continue

    const category = (opp.category || "").toLowerCase().trim()
    const type = (opp.type || "").toLowerCase().trim()
    const company = (opp.company || "").toLowerCase().trim()
    const status = row.status

    profile.totalActions++

    if (status === "saved" || status === "applied") {
      profile.totalPositive++

      if (category) {
        profile.positiveCategories.set(
          category,
          (profile.positiveCategories.get(category) || 0) + 1
        )
      }
      if (type) {
        profile.positiveTypes.set(type, (profile.positiveTypes.get(type) || 0) + 1)
      }
      if (company) {
        profile.positiveOrgs.add(company)
      }
    } else if (status === "dismissed") {
      profile.totalNegative++

      if (category) {
        profile.negativeCategories.set(
          category,
          (profile.negativeCategories.get(category) || 0) + 1
        )
      }
      if (type) {
        profile.negativeTypes.set(type, (profile.negativeTypes.get(type) || 0) + 1)
      }
    }
  }

  return profile
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score an opportunity based on the user's behavioral history.
 * Returns 0–20 using Bayesian posterior with Laplace smoothing.
 *
 * New users (totalActions = 0) get a baseline of 10 (uniform prior).
 */
export function scoreBehavioral(
  opp: OpportunityForScoring,
  signals: BehavioralProfile
): { score: number; reasons: string[] } {
  // New user — uniform prior, return baseline
  if (signals.totalActions === 0) {
    return { score: 10, reasons: [] }
  }

  let score = 0
  const reasons: string[] = []

  const category = (opp.category || "").toLowerCase().trim()
  const type = (opp.type || "").toLowerCase().trim()
  const company = (opp.company || "").toLowerCase().trim()

  // ── Category signal (0–10 via Bayesian posterior) ──
  if (category) {
    const positiveCount = signals.positiveCategories.get(category) || 0
    const negativeCount = signals.negativeCategories.get(category) || 0

    // Bayesian posterior: P(like | category) = (positive + 1) / (total + 2)
    // Laplace smoothing ensures new categories get ~0.5 probability
    const posterior = (positiveCount + 1) / (signals.totalActions + 2)

    // Scale posterior (0.0–1.0) to 0–10 points
    const categoryScore = Math.round(posterior * 10)
    score += categoryScore

    if (positiveCount >= 2) {
      reasons.push("Similar to opportunities you've saved")
    }

    // Penalty for frequently dismissed categories
    if (negativeCount >= 2 && negativeCount > positiveCount) {
      score -= 5
      reasons.push("You've dismissed similar opportunities before")
    }
  } else {
    // No category — assign neutral 5 points
    score += 5
  }

  // ── Type signal (+0–5) ──
  if (type && signals.positiveTypes.size > 0) {
    const typeCount = signals.positiveTypes.get(type) || 0
    if (typeCount > 0) {
      const typeBoost = Math.min(5, Math.round((typeCount / signals.totalPositive) * 10))
      score += typeBoost

      if (typeCount >= 2 && !reasons.some((r) => r.includes("saved"))) {
        reasons.push(`Matches your preferred type`)
      }
    }
  }

  // ── Organization signal (+0–5) ──
  if (company && signals.positiveOrgs.has(company)) {
    score += 5
    reasons.push(`From ${opp.company}, an organization you've engaged with`)
  }

  // Clamp to 0–20
  return {
    score: Math.max(0, Math.min(20, score)),
    reasons,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyProfile(): BehavioralProfile {
  return {
    positiveCategories: new Map(),
    positiveTypes: new Map(),
    positiveOrgs: new Set(),
    negativeCategories: new Map(),
    negativeTypes: new Map(),
    totalActions: 0,
    totalPositive: 0,
    totalNegative: 0,
  }
}
