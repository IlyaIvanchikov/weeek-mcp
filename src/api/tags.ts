import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { asRecord, pickArray } from "./responses.js";
import type { NewTag, SuccessResponse, Tag, TagUpdate } from "./types.js";

export interface UpdateTagOptions { tagId: number; update: TagUpdate; }

const ops = operations.tags;

export function toTag(raw: unknown): Tag {
  const r = asRecord(raw);
  return { id: Number(r.id), title: String(r.title ?? ""), color: String(r.color ?? "") };
}

export class TagsApi {
  constructor(private http: HttpClient) {}

  async list(): Promise<Tag[]> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list);
    return pickArray(json, "tags").map(toTag);
  }

  async get(tagId: number): Promise<Tag> {
    const json = await this.http.execute<{ tag: unknown }>(ops.get, { params: { tagId } });
    return toTag(json.tag);
  }

  async create(newTag: NewTag): Promise<Tag> {
    const json = await this.http.execute<{ tag: unknown }>(ops.create, { body: newTag });
    return toTag(json.tag);
  }

  // PUT answers with success only, so the tag is re-read.
  async update({ tagId, update }: UpdateTagOptions): Promise<Tag> {
    await this.http.execute<SuccessResponse>(ops.update, { params: { tagId }, body: update });
    return this.get(tagId);
  }

  async remove(tagId: number): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { tagId } });
  }
}
