import { Status } from "../engine/types.js";

// Shrunk relative to the Fastify server's contract: no topics[], no profile_id. The
// function builds both from the caller's own authenticated DB state (v_topic_stats),
// which is what closes the prototype's "trusts a client-supplied profile_id/topics"
// security gap.
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

export interface SolveRequest {
  request_id: string;
  edition_id: number;
  params: WireParams;
}

export interface DbTopicRow {
  profile_id: string;
  topic_id: string;
  topic_label: string;
  subject_label: string;
  branch_label: string;
  items_in_book: number;
  answered: number;
  correct: number;
  last_practiced: string | null;
  cohort_mastery: string | null; // PostgREST serializes numeric as a string
  ref_seconds: number;
  book_page_ref: number | null;
  reliable: boolean;
}

export interface WirePlanEntry {
  rank: number;
  topic_id: string;
  topic_label: string;
  subject_label: string;
  branch_label: string;
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
