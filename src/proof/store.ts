import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExifSummary } from "./exif";

export interface ProofRow {
  id: string;
  betId: string;
  submitterId: string;
  providerMessageId: string;
  storagePath: string;
  mime: string;
  bytes: number;
  sha256: string;
  phash: string | null;
  exif: ExifSummary;
  capturedAt: string | null;
  receivedAt: string;
  status: "received" | "rejected_duplicate" | "judged";
}

export interface VerdictRow {
  id: string;
  betId: string;
  proofId: string;
  pass: 1 | 2;
  outcome: "for" | "against" | "inconclusive";
  confidence: number;
  criteriaChecks: Array<{ criterion: string; met: boolean; evidence: string }>;
  challengeTokenVisible: boolean;
  tamperFlags: string[];
  reasoning: string;
  model: string;
  createdAt: string;
}

export interface JobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface ProofStore {
  createProof(proof: Omit<ProofRow, "id" | "receivedAt" | "status">): Promise<ProofRow>;
  proofsForBet(betId: string): Promise<ProofRow[]>;
  getProof(proofId: string): Promise<ProofRow | null>;
  markProof(proofId: string, status: ProofRow["status"]): Promise<void>;
  createVerdict(verdict: Omit<VerdictRow, "id" | "createdAt">): Promise<VerdictRow>;
  verdictsForBet(betId: string): Promise<VerdictRow[]>;
  claimJobs(kind: string, limit: number, maxAttempts: number): Promise<JobRow[]>;
  finishJob(jobId: string, ok: boolean, error?: string): Promise<void>;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export class SupabaseProofStore implements ProofStore {
  constructor(private readonly db: SupabaseClient) {}

  private static row(r: Record<string, unknown>): ProofRow {
    return {
      id: r.id as string,
      betId: r.bet_id as string,
      submitterId: r.submitter_id as string,
      providerMessageId: r.provider_message_id as string,
      storagePath: r.storage_path as string,
      mime: r.mime as string,
      bytes: Number(r.bytes),
      sha256: r.sha256 as string,
      phash: (r.phash as string | null) ?? null,
      exif: (r.exif as ExifSummary) ?? {},
      capturedAt: (r.captured_at as string | null) ?? null,
      receivedAt: r.received_at as string,
      status: r.status as ProofRow["status"],
    };
  }

  async createProof(p: Omit<ProofRow, "id" | "receivedAt" | "status">): Promise<ProofRow> {
    const { data, error } = await this.db
      .from("proofs")
      .insert({
        bet_id: p.betId, submitter_id: p.submitterId, provider_message_id: p.providerMessageId, storage_path: p.storagePath,
        mime: p.mime, bytes: p.bytes, sha256: p.sha256, phash: p.phash, exif: p.exif, captured_at: p.capturedAt,
      })
      .select("*")
      .single();
    if (error || !data) fail("proofs.insert", error);
    return SupabaseProofStore.row(data);
  }

  async proofsForBet(betId: string): Promise<ProofRow[]> {
    const { data, error } = await this.db.from("proofs").select("*").eq("bet_id", betId).order("received_at");
    if (error) fail("proofs.list", error);
    return (data ?? []).map(SupabaseProofStore.row);
  }

  async getProof(proofId: string): Promise<ProofRow | null> {
    const { data, error } = await this.db.from("proofs").select("*").eq("id", proofId).maybeSingle();
    if (error) fail("proofs.get", error);
    return data ? SupabaseProofStore.row(data) : null;
  }

  async markProof(proofId: string, status: ProofRow["status"]): Promise<void> {
    const { error } = await this.db.from("proofs").update({ status }).eq("id", proofId);
    if (error) fail("proofs.mark", error);
  }

  async createVerdict(v: Omit<VerdictRow, "id" | "createdAt">): Promise<VerdictRow> {
    const { data, error } = await this.db
      .from("verdicts")
      .insert({
        bet_id: v.betId, proof_id: v.proofId, pass: v.pass, outcome: v.outcome, confidence: v.confidence,
        criteria_checks: v.criteriaChecks, challenge_token_visible: v.challengeTokenVisible, tamper_flags: v.tamperFlags,
        reasoning: v.reasoning, model: v.model,
      })
      .select("id, created_at")
      .single();
    if (error || !data) fail("verdicts.insert", error);
    return { ...v, id: data.id, createdAt: data.created_at };
  }

  async verdictsForBet(betId: string): Promise<VerdictRow[]> {
    const { data, error } = await this.db.from("verdicts").select("*").eq("bet_id", betId).order("created_at");
    if (error) fail("verdicts.list", error);
    return (data ?? []).map((r) => ({
      id: r.id, betId: r.bet_id, proofId: r.proof_id, pass: r.pass, outcome: r.outcome, confidence: Number(r.confidence),
      criteriaChecks: r.criteria_checks ?? [], challengeTokenVisible: r.challenge_token_visible, tamperFlags: r.tamper_flags ?? [],
      reasoning: r.reasoning, model: r.model, createdAt: r.created_at,
    }));
  }

  async claimJobs(kind: string, limit: number, maxAttempts: number): Promise<JobRow[]> {
    const { data, error } = await this.db.rpc("claim_jobs", { p_kind: kind, p_limit: limit, p_max_attempts: maxAttempts });
    if (error) fail("claim_jobs", error);
    return ((data ?? []) as Array<{ id: string; kind: string; payload: Record<string, unknown>; attempts: number }>).map((r) => ({
      id: r.id, kind: r.kind, payload: r.payload, attempts: r.attempts,
    }));
  }

  async finishJob(jobId: string, ok: boolean, error?: string): Promise<void> {
    if (!ok) {
      const { error: rqError } = await this.db.rpc("requeue_job", { p_id: jobId, p_error: error ?? "unknown" });
      if (rqError) fail("requeue_job", rqError);
      return;
    }
    const { error: dbError } = await this.db
      .from("jobs")
      .update({ status: "done", last_error: null, finished_at: new Date().toISOString(), locked_at: null })
      .eq("id", jobId);
    if (dbError) fail("jobs.finish", dbError);
  }
}

export class MemoryProofStore implements ProofStore {
  readonly proofs: ProofRow[] = [];
  readonly verdicts: VerdictRow[] = [];
  readonly jobs: Array<JobRow & { status: string; error?: string }> = [];
  private seq = 0;

  async createProof(p: Omit<ProofRow, "id" | "receivedAt" | "status">): Promise<ProofRow> {
    const row: ProofRow = { ...p, id: `proof-${++this.seq}`, receivedAt: new Date().toISOString(), status: "received" };
    this.proofs.push(row);
    return row;
  }
  async proofsForBet(betId: string): Promise<ProofRow[]> {
    return this.proofs.filter((p) => p.betId === betId);
  }
  async getProof(proofId: string): Promise<ProofRow | null> {
    return this.proofs.find((p) => p.id === proofId) ?? null;
  }
  async markProof(proofId: string, status: ProofRow["status"]): Promise<void> {
    const p = this.proofs.find((x) => x.id === proofId);
    if (p) p.status = status;
  }
  async createVerdict(v: Omit<VerdictRow, "id" | "createdAt">): Promise<VerdictRow> {
    const row: VerdictRow = { ...v, id: `verdict-${++this.seq}`, createdAt: new Date().toISOString() };
    this.verdicts.push(row);
    return row;
  }
  async verdictsForBet(betId: string): Promise<VerdictRow[]> {
    return this.verdicts.filter((v) => v.betId === betId);
  }
  enqueue(kind: string, payload: Record<string, unknown>): void {
    this.jobs.push({ id: `job-${++this.seq}`, kind, payload, attempts: 0, status: "queued" });
  }
  async claimJobs(kind: string, limit: number, maxAttempts: number): Promise<JobRow[]> {
    const picked = this.jobs.filter((j) => j.kind === kind && j.status === "queued" && j.attempts < maxAttempts).slice(0, limit);
    for (const j of picked) {
      j.status = "running";
      j.attempts += 1;
    }
    return picked;
  }
  async finishJob(jobId: string, ok: boolean, error?: string): Promise<void> {
    const j = this.jobs.find((x) => x.id === jobId);
    if (!j) return;
    j.status = ok ? "done" : "queued";
    j.error = error;
  }
}
