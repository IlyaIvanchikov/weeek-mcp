import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import type { Attachment, AttachmentBytes, DownloadAttachmentOptions } from "./types.js";

export class AttachmentsApi {
  constructor(private http: HttpClient) {}

  async get(id: string): Promise<Attachment> {
    const json = await this.http.execute<{ data?: unknown }>(operations.attachments.get, { params: { fileId: id } });
    return json.data as Attachment;
  }

  /**
   * Fetch an attachment's bytes from the URL its metadata carries.
   *
   * Security: the URL describes a file an untrusted task author uploaded, and for a
   * third-party `service` it points at that vendor's host. So: only weeek-hosted attachments
   * are downloaded at all; the first hop must be the API origin; HttpClient.download sends
   * no credentials and follows one https redirect only; and the size is capped before the
   * request when declared and again on the body — refusing loudly, never truncating.
   */
  async download({ attachment, maxBytes }: DownloadAttachmentOptions): Promise<AttachmentBytes> {
    if (attachment.service !== "weeek") {
      throw new Error(`attachment ${attachment.id} is stored in ${attachment.service}; only weeek-hosted attachments can be downloaded`);
    }
    let url: URL;
    try {
      url = new URL(attachment.url);
    } catch {
      throw new Error(`attachment ${attachment.id} has an unusable url`);
    }
    if (url.origin !== this.http.origin) {
      throw new Error(`attachment ${attachment.id} url origin ${url.origin} is not the WEEEK API origin ${this.http.origin}`);
    }
    const tooLarge = (actual: number) => new Error(`attachment ${attachment.id} is too large (${actual} > ${maxBytes} bytes)`);
    if (attachment.size !== undefined && attachment.size > maxBytes) throw tooLarge(attachment.size);
    const { bytes, contentType } = await this.fetchBytes(attachment.id, url);
    if (bytes.byteLength > maxBytes) throw tooLarge(bytes.byteLength);
    return { bytes, contentType };
  }

  // HttpClient is generic and cannot name the attachment, so its errors are prefixed here.
  // The same object is rethrown so WeeekApiError's status and WeeekTimeoutError survive.
  private async fetchBytes(id: string, url: URL): Promise<AttachmentBytes> {
    try {
      return await this.http.download(url);
    } catch (err) {
      if (err instanceof Error) err.message = `attachment ${id}: ${err.message}`;
      throw err;
    }
  }
}
