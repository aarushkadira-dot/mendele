export interface InsightPayload {
  headline: string
  tip: string
  insight_type: "eligibility_boost" | "strategy_tip" | "strong_match" | "stretch_goal"
}
