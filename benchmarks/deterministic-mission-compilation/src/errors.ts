import type { ClosedReason } from "./contracts.js";

export class ClosedFailure extends Error {
  readonly reason: ClosedReason;

  constructor(reason: ClosedReason) {
    super(reason);
    this.name = "ClosedFailure";
    this.reason = reason;
  }
}

export function fail(reason: ClosedReason): never {
  throw new ClosedFailure(reason);
}
