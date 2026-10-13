// Every tool that deletes, archives or detaches carries these and gates on `confirmation`
// (src/tools/inputs.ts); tests/tool-quality.test.ts enforces the pair by tool name.
export const destructiveAnnotations = { destructiveHint: true, idempotentHint: false } as const;
