import { Status } from "../engine/review-planner/types.js";

export interface WireParams {
  budget_min: number;
  min_strong: number;
  strong_threshold?: number;
  min_items?: number;
  prior_strength?: number;
  default_prior?: number;
  recency_weight?: number;
  half_life_days?: number;
  review_factor?: number;
}

export interface WireTopic {
  topic_id: string;
  items_in_book: number;
  answered: number;
  correct: number;
  days_since_practice: number | null;
  cohort_mastery: number | null;
  ref_time_sec: number;
  book_page_ref?: number | null;
}

export interface SolveRequest {
  request_id: string;
  profile_id: string;
  edition_id: number;
  params: WireParams;
  topics: WireTopic[];
}

export interface WirePlanEntry {
  rank: number;
  topic_id: string;
  cost_min: number;
  value: number;
  mastery: number;
  weakness: number;
  staleness: number;
  strong: boolean;
  reliable: boolean;
  book_page_ref: number | null;
}

export interface WireCertificate {
  exact: true;
  objective: number;
  budget_min: number;
  total_cost_min: number;
  q_requested: number;
  q_used: number;
  strong_selected: number;
  plan: WirePlanEntry[];
  excluded_topic_ids: string[];
}

export interface WireEngineMeta {
  name: string;
  version: string;
  algorithm: string;
}

export interface WireMetrics {
  n_topics: number;
  dp_cells: number;
  runtime_ms: number;
}

export interface SolveResponse {
  request_id: string;
  status: Status;
  engine: WireEngineMeta;
  certificate: WireCertificate;
  metrics: WireMetrics;
  warnings: string[];
}
