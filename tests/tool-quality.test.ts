// Encodes the properties Glama's Tool Definition Quality Score grades and the safety rule
// this server promises in its README, so a new tool cannot quietly regress them.
import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../src/server.js";
import { listTools } from "./helpers/list-tools.js";
import { httpConfig } from "./helpers/http.js";
import { allToolNames } from "./helpers/tool-names.js";

type Tool = Awaited<ReturnType<typeof listTools>>[number];
let tools: Tool[] = [];

beforeAll(async () => {
  tools = await listTools(buildServer({ ...httpConfig, attachMaxBytes: 1024, toolsets: ["all"] }));
});

const VERB_NOUN = /^weeek_[a-z]+_[a-z]+(_[a-z]+)*$/;
// The one pre-existing deviation; renaming it would break every installed client.
const namingExceptions = new Set(["weeek_version"]);
const destructiveName = /^weeek_(delete|archive|detach|remove)_/;

const requiresConfirm = (t: Tool) => Array.isArray(t.inputSchema.required) && t.inputSchema.required.includes("confirm");
const isDestructive = (t: Tool) => t.annotations?.destructiveHint === true;

describe("tool quality", () => {
  it("registers exactly the documented surface for all", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(allToolNames);
  });

  it("names every tool weeek_<verb>_<noun>", () => {
    const bad = tools.map((t) => t.name).filter((n) => !namingExceptions.has(n) && !VERB_NOUN.test(n));
    expect(bad).toEqual([]);
  });

  it("marks every destructive-named tool destructive and gates it behind confirm:true", () => {
    const unguarded = tools.filter((t) => destructiveName.test(t.name) && !(isDestructive(t) && requiresConfirm(t))).map((t) => t.name);
    expect(unguarded).toEqual([]);
  });

  it("gates every tool that declares destructiveHint behind confirm:true", () => {
    const unguarded = tools.filter((t) => isDestructive(t) && !requiresConfirm(t)).map((t) => t.name);
    expect(unguarded).toEqual([]);
  });

  it("gates every tool whose name says it detaches or deletes, by name list", () => {
    const expected = allToolNames.filter((n) => destructiveName.test(n));
    const gated = tools.filter((t) => isDestructive(t) && requiresConfirm(t)).map((t) => t.name).sort();
    expect(gated).toEqual(expected);
  });

  it("gives every tool a description that says something and stays readable", () => {
    const bad = tools.filter((t) => !t.description || t.description.trim().length < 20 || t.description.length > 600).map((t) => t.name);
    expect(bad).toEqual([]);
  });
});
