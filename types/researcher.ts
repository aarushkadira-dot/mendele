export interface ScoredProfile {
  name: string
  title: string
  institution: string
  department: string
  type: "researcher" | "investor"
  profile_tier:
    | "phd_professor"
    | "postdoc"
    | "grad_student"
    | "partner_vc"
    | "angel_investor"
    | "accelerator"
  research_focus: string
  evidence_of_student_work: string
  scores: {
    topic_match: number
    student_collaboration: number
    availability: number
    experience_level: number
    trend_alignment: number
  }
  overall_match: number
  engagement_likelihood: number
  years_experience: number
  active_projects: number
  contact_strategy: string
  email_hint: string
}

export interface StudentProfile {
  name: string
  grade: string
  interests: string
  skills: string
  achievements: string
}
