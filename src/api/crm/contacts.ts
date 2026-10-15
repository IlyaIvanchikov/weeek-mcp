import type { HttpClient } from "../../http.js";
import { operations } from "../../operations.js";
import { asRecord, fullName, pageHasMore, pickArray, stringList, tagIdList } from "../responses.js";
import { orNullWhenMissing } from "../requests.js";
import { toDetails } from "./details.js";
import type { Contact, ContactPage, ContactUpdate, CrmQuery, NewContact, SuccessResponse } from "../types.js";

export interface UpdateContactOptions { contactId: string; update: ContactUpdate; }
export interface ContactTagOptions { contactId: string; tagId: number; }

const ops = operations.contacts;

export function toContact(raw: unknown): Contact {
  const r = asRecord(raw);
  return {
    id: String(r.id ?? ""),
    firstName: String(r.firstName ?? ""),
    middleName: r.middleName == null ? null : String(r.middleName),
    lastName: r.lastName == null ? null : String(r.lastName),
    name: fullName(r),
    organizations: stringList(r.organizations),
    emails: toDetails(r.emails, "email"),
    phones: toDetails(r.phones, "phone"),
    tags: tagIdList(r.tags),
  };
}

export class ContactsApi {
  constructor(private http: HttpClient) {}

  async list(query: CrmQuery = {}): Promise<ContactPage> {
    const json = await this.http.execute<Record<string, unknown>>(ops.list, { query });
    const contacts = pickArray(json, "contacts").map(toContact);
    return { contacts, hasMore: pageHasMore(contacts.length, query.limit) };
  }

  async get(contactId: string): Promise<Contact> {
    const json = await this.http.execute<{ contact: unknown }>(ops.get, { params: { contactId } });
    return toContact(json.contact);
  }

  async tryGet(contactId: string): Promise<Contact | null> {
    return orNullWhenMissing(this.get(contactId));
  }

  async create(newContact: NewContact): Promise<Contact> {
    const json = await this.http.execute<{ contact: unknown }>(ops.create, { body: newContact });
    return toContact(json.contact);
  }

  async update({ contactId, update }: UpdateContactOptions): Promise<Contact> {
    const json = await this.http.execute<{ contact: unknown }>(ops.update, { params: { contactId }, body: update });
    return toContact(json.contact);
  }

  async remove(contactId: string): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.remove, { params: { contactId } });
  }

  async addTag({ contactId, tagId }: ContactTagOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.addTag, { params: { contactId }, body: { tagId } });
  }

  async removeTag({ contactId, tagId }: ContactTagOptions): Promise<SuccessResponse> {
    return this.http.execute<SuccessResponse>(ops.removeTag, { params: { contactId }, body: { tagId } });
  }
}
