import "server-only";

import { randomUUID } from "node:crypto";

import { loadDemo as load, mutateDemo as mutate, type DemoRequest, type DemoStore as Store } from "@/lib/demo/store";

import {
  emptySections,
  normalizeCommitment,
  titleFromDesire,
  type GenerationRequestSummary,
  type IntakeDraft,
  type IntakeSections,
  type IntakeSummary,
  type SectionKey,
} from "./model";
import { IntakeLockedError, IntakeNotFoundError, type IntakeRepository, type Progress } from "./repository";
import type { IntakeSnapshotV2 } from "./snapshot";

/** Demo-mode intake persistence, backed by the shared demo file store. */

type StoredRequest = DemoRequest;

function editable(store: Store, userId: string, id: string) {
  const intake = store.intakes[id];
  if (!intake || intake.userId !== userId) throw new IntakeNotFoundError();
  if (intake.status !== "in_progress") throw new IntakeLockedError();
  return intake;
}

function strip(stored: IntakeDraft & { userId: string }): IntakeDraft {
  const draft: Partial<IntakeDraft & { userId: string }> = { ...stored };
  delete draft.userId;
  const d = draft as IntakeDraft;
  return { ...d, day: { ...d.day, commitments: d.day.commitments.map(normalizeCommitment) } };
}

function summary(r: StoredRequest): GenerationRequestSummary {
  return { id: r.id, intakeId: r.intakeId, title: r.title, status: r.status, planId: r.planId, createdAt: r.createdAt };
}

export class DemoIntakeRepository implements IntakeRepository {
  async listInProgress(userId: string): Promise<IntakeSummary[]> {
    const store = await load();
    return Object.values(store.intakes)
      .filter((i) => i.userId === userId && i.status === "in_progress")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((i) => ({
        id: i.id,
        title: titleFromDesire(i.desire.desire),
        currentStep: i.currentStep,
        completedCount: i.completedSteps.filter((s) => s !== "review").length,
        updatedAt: i.updatedAt,
      }));
  }

  create(userId: string) {
    return mutate((store) => {
      const id = randomUUID();
      store.intakes[id] = {
        ...emptySections(),
        id,
        userId,
        status: "in_progress",
        currentStep: "desire",
        completedSteps: [],
        updatedAt: new Date().toISOString(),
        requestId: null,
      };
      return id;
    });
  }

  async get(userId: string, intakeId: string) {
    const store = await load();
    const intake = store.intakes[intakeId];
    return intake && intake.userId === userId ? strip(intake) : null;
  }

  saveSection<K extends SectionKey>(userId: string, intakeId: string, key: K, data: IntakeSections[K]) {
    return mutate((store) => {
      const intake = editable(store, userId, intakeId);
      (intake as IntakeSections)[key] = data;
      intake.updatedAt = new Date().toISOString();
    });
  }

  saveProgress(userId: string, intakeId: string, progress: Progress) {
    return mutate((store) => {
      const intake = editable(store, userId, intakeId);
      intake.currentStep = progress.currentStep;
      intake.completedSteps = progress.completedSteps;
      intake.updatedAt = new Date().toISOString();
    });
  }

  submit(userId: string, intakeId: string, snapshot: IntakeSnapshotV2) {
    return mutate((store) => {
      const intake = store.intakes[intakeId];
      if (!intake || intake.userId !== userId) throw new IntakeNotFoundError();
      if (intake.status === "submitted" && intake.requestId) return intake.requestId;
      if (intake.status !== "in_progress") throw new IntakeLockedError();

      const id = randomUUID();
      const now = new Date().toISOString();
      store.requests[id] = {
        id,
        userId,
        intakeId,
        // Demo mode has no manifestations table; the intake stands in for it.
        manifestationId: intakeId,
        planId: null,
        kind: "initial",
        params: {},
        status: "queued",
        attempts: 0,
        baseVersion: null,
        snapshot,
        title: titleFromDesire(intake.desire.desire) ?? "Your manifestation",
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        startedAt: null,
        completedAt: null,
      };
      intake.status = "submitted";
      intake.currentStep = "review";
      intake.requestId = id;
      intake.updatedAt = now;
      return id;
    });
  }

  archive(userId: string, intakeId: string) {
    return mutate((store) => {
      const intake = store.intakes[intakeId];
      if (intake && intake.userId === userId && intake.status === "in_progress") intake.status = "archived";
    });
  }

  async getRequest(userId: string, requestId: string) {
    const store = await load();
    const r = store.requests[requestId];
    if (!r || r.userId !== userId) return null;
    return summary(r);
  }

  async listRequests(userId: string) {
    const store = await load();
    return Object.values(store.requests)
      .filter((r) => r.userId === userId && r.kind === "initial" && r.status !== "completed" && r.status !== "cancelled")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(summary);
  }
}
