export class WeeekApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = "WeeekApiError";
  }
}

export class WeeekTimeoutError extends Error {
  constructor(message = "WEEEK request timed out") {
    super(message);
    this.name = "WeeekTimeoutError";
  }
}

export interface Candidate { id: number | string; name: string; }

export class ResolutionError extends Error {
  constructor(public kind: string, public query: string, public candidates: Candidate[]) {
    const list = candidates.length
      ? candidates.map((c) => `${c.name} (id ${c.id})`).join(", ")
      : "none";
    super(`could not resolve ${kind} "${query}"; candidates: ${list}`);
    this.name = "ResolutionError";
  }
}
