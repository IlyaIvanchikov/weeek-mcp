export function jsonReply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function imageReply(bytes: Uint8Array, mimeType: string) {
  return {
    content: [{ type: "image" as const, data: Buffer.from(bytes).toString("base64"), mimeType }],
  };
}

export function errorReply(err: unknown) {
  const e = err as { name?: string; message?: string; candidates?: unknown };
  const payload =
    e?.name === "ResolutionError"
      ? { error: e.message, candidates: (e as any).candidates }
      : { error: e?.message ?? String(err) };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}
