import type { HttpClient, PathParams } from "../../http.js";
import { operations, type Operation } from "../../operations.js";
import { asRecord } from "../responses.js";
import type { Detail, DetailKind, DetailOwner, SuccessResponse } from "../types.js";

export interface DetailRef { owner: DetailOwner; kind: DetailKind; }
export interface AddDetailOptions extends DetailRef { value: string; }
export interface UpdateDetailOptions extends DetailRef { detailId: string; value: string; }
export interface RemoveDetailOptions extends DetailRef { detailId: string; }

interface DetailRoutes { add: Operation; update: Operation; remove: Operation; }

// A contact has no addresses; the null says so where the routes live, and the methods refuse it before any request.
const routes: Record<DetailOwner["kind"], Record<DetailKind, DetailRoutes | null>> = {
  organization: {
    address: { add: operations.organizations.addAddress, update: operations.organizations.updateAddress, remove: operations.organizations.removeAddress },
    email: { add: operations.organizations.addEmail, update: operations.organizations.updateEmail, remove: operations.organizations.removeEmail },
    phone: { add: operations.organizations.addPhone, update: operations.organizations.updatePhone, remove: operations.organizations.removePhone },
  },
  contact: {
    address: null,
    email: { add: operations.contacts.addEmail, update: operations.contacts.updateEmail, remove: operations.contacts.removeEmail },
    phone: { add: operations.contacts.addPhone, update: operations.contacts.updatePhone, remove: operations.contacts.removePhone },
  },
};

function ownerParams(owner: DetailOwner): PathParams {
  switch (owner.kind) {
    case "organization": return { organizationId: owner.id };
    case "contact": return { contactId: owner.id };
    default: { const _exhaustive: never = owner.kind; throw new Error(`unhandled detail owner ${String(_exhaustive)}`); }
  }
}

function routesOf({ owner, kind }: DetailRef): DetailRoutes {
  const found = routes[owner.kind][kind];
  if (found === null) throw new Error(`a ${owner.kind} has no ${kind}es; only organizations do`);
  return found;
}

/** One detail as the API answers it: `{ id, <kind>: value }`. */
export function toDetail(raw: unknown, kind: DetailKind): Detail {
  const r = asRecord(raw);
  return { id: String(r.id ?? ""), value: String(r[kind] ?? "") };
}

export function toDetails(list: unknown, kind: DetailKind): Detail[] {
  return Array.isArray(list) ? list.map((item) => toDetail(item, kind)) : [];
}

/** Addresses, emails and phones of organizations and contacts — the same three verbs over two owners. */
export class DetailsApi {
  constructor(private http: HttpClient) {}

  async add({ owner, kind, value }: AddDetailOptions): Promise<Detail> {
    const json = await this.http.execute<Record<string, unknown>>(routesOf({ owner, kind }).add, { params: ownerParams(owner), body: { [kind]: value } });
    return toDetail(json[kind], kind);
  }

  async update({ owner, kind, detailId, value }: UpdateDetailOptions): Promise<Detail> {
    const json = await this.http.execute<Record<string, unknown>>(routesOf({ owner, kind }).update, { params: { ...ownerParams(owner), [`${kind}Id`]: detailId }, body: { [kind]: value } });
    return toDetail(json[kind], kind);
  }

  async remove({ owner, kind, detailId }: RemoveDetailOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(routesOf({ owner, kind }).remove, { params: { ...ownerParams(owner), [`${kind}Id`]: detailId } });
  }
}
