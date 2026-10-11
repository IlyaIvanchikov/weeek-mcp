import { describe, it, expect, vi } from "vitest";
import { AttachmentsApi } from "../../src/api/attachments.js";
import { jsonFetch, binaryFetch, httpWith, sent } from "../helpers/http.js";

const weeekFile = (over: Record<string, unknown> = {}) => ({
  id: "a1", creatorId: "u1", service: "weeek" as const, name: "modules.png",
  url: "https://api.weeek.net/ws/1005494/files/a1?sig=x", size: 4, createdAt: "2026-08-01T10:00:00Z", ...over,
});

describe("AttachmentsApi", () => {
  it("get GETs /ws/attachments/{id} and returns the data envelope", async () => {
    const att = weeekFile();
    const f = jsonFetch(200, { success: true, data: att });
    expect(await new AttachmentsApi(httpWith(f)).get(att.id)).toEqual(att);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/ws/attachments/a1");
  });

  it("download fetches the pre-signed url without credentials and returns bytes + content-type", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const f = binaryFetch(200, png, "image/png");
    const attachment = weeekFile({ size: png.length });
    const out = await new AttachmentsApi(httpWith(f)).download({ attachment, maxBytes: 1024 });
    expect(out.contentType).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
    expect(sent(f).url).toBe(attachment.url);
    expect(sent(f).init.headers ?? {}).not.toHaveProperty("Authorization");
  });

  it("download refuses an attachment stored in an external service", async () => {
    const f = binaryFetch(200, new Uint8Array([1]), "image/png");
    const attachment = weeekFile({ service: "google_drive", url: "https://drive.google.com/file/a1", size: undefined });
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment, maxBytes: 1024 })).rejects.toThrow(/google_drive/);
    expect(f).not.toHaveBeenCalled();
  });

  it("download refuses a url outside the API origin", async () => {
    const f = binaryFetch(200, new Uint8Array([1]), "image/png");
    const attachment = weeekFile({ url: "https://evil.example.com/steal" });
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment, maxBytes: 1024 })).rejects.toThrow(/origin/);
    expect(f).not.toHaveBeenCalled();
  });

  it("download refuses a declared size over maxBytes without fetching", async () => {
    const f = binaryFetch(200, new Uint8Array([1]), "image/png");
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment: weeekFile({ size: 5000 }), maxBytes: 1024 })).rejects.toThrow(/too large/);
    expect(f).not.toHaveBeenCalled();
  });

  it("download refuses a body over maxBytes even when size was absent", async () => {
    const f = binaryFetch(200, new Uint8Array(2048), "image/png");
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment: weeekFile({ size: undefined }), maxBytes: 1024 })).rejects.toThrow(/too large/);
    expect(f).toHaveBeenCalled();
  });

  it("download names the attachment on an HTTP failure and keeps the WeeekApiError status", async () => {
    const f = binaryFetch(403, new Uint8Array(), "text/plain");
    const failure = new AttachmentsApi(httpWith(f)).download({ attachment: weeekFile(), maxBytes: 1024 });
    await expect(failure).rejects.toMatchObject({ name: "WeeekApiError", status: 403 });
    await expect(failure).rejects.toThrow(/attachment a1/);
  });

  it("download names the attachment when the storage host cannot be reached", async () => {
    const f = vi.fn(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); });
    await expect(new AttachmentsApi(httpWith(f)).download({ attachment: weeekFile(), maxBytes: 1024 }))
      .rejects.toThrow(/attachment a1.*could not reach/s);
  });
});
