import { describe, it, expect } from "vitest";
import { ProjectsApi } from "../../src/api/projects.js";
import { jsonFetch, httpWith, sent, bearer } from "../helpers/http.js";

const rawProject = { id: 1, name: "Marketing", description: null, color: "#fff", status: 1, isPrivate: false, portfolioId: 7, team: ["u1"], customFields: [], logoLink: null };
const project = { id: 1, name: "Marketing", description: null, color: "#fff", status: 1, isPrivate: false, portfolioId: 7, team: ["u1"], customFields: [] };
const base = "https://api.weeek.net/public/v1/tm/projects";

describe("ProjectsApi", () => {
  it("list GETs /tm/projects with the bearer and normalises each project", async () => {
    const f = jsonFetch(200, { success: true, projects: [rawProject] });
    expect(await new ProjectsApi(httpWith(f)).list()).toEqual([project]);
    expect(sent(f).url).toBe(base);
    expect(sent(f).init.headers).toMatchObject({ Authorization: bearer });
  });

  it("list defaults missing fields instead of failing", async () => {
    const f = jsonFetch(200, { success: true, projects: [{ id: 2, name: "Bare", status: 9 }] });
    expect(await new ProjectsApi(httpWith(f)).list()).toEqual([{ id: 2, name: "Bare", description: null, color: null, status: null, isPrivate: false, portfolioId: null, team: [], customFields: [] }]);
  });

  it("get GETs /tm/projects/{id}", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    expect(await new ProjectsApi(httpWith(f)).get(1)).toEqual(project);
    expect(sent(f).url).toBe(`${base}/1`);
  });

  it("create POSTs name + isPrivate as 0/1 and the optional fields only when given", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    expect(await new ProjectsApi(httpWith(f)).create({ name: "Marketing", isPrivate: false, description: "d", portfolioId: 7 })).toEqual(project);
    expect(sent(f).init.method).toBe("POST");
    expect(sent(f).json()).toEqual({ name: "Marketing", isPrivate: 0, description: "d", portfolioId: 7 });
    const g = jsonFetch(200, { success: true, project: rawProject });
    await new ProjectsApi(httpWith(g)).create({ name: "P", isPrivate: true });
    expect(sent(g).json()).toEqual({ name: "P", isPrivate: 1 });
  });

  it("update PUTs the replacement then re-reads the project", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    expect(await new ProjectsApi(httpWith(f)).update({ projectId: 1, update: { name: "M2", isPrivate: true, color: "#000" } })).toEqual(project);
    expect(sent(f, 0).init.method).toBe("PUT");
    expect(sent(f, 0).url).toBe(`${base}/1`);
    expect(sent(f, 0).json()).toEqual({ name: "M2", isPrivate: 1, color: "#000" });
    expect(sent(f, 1).url).toBe(`${base}/1`);
  });

  it("remove DELETEs and returns the envelope", async () => {
    const f = jsonFetch(200, { success: true });
    expect(await new ProjectsApi(httpWith(f)).remove(1)).toEqual({ success: true });
    expect(sent(f).init.method).toBe("DELETE");
    expect(sent(f).url).toBe(`${base}/1`);
  });

  it("setArchived POSTs /archive or /un-archive then re-reads", async () => {
    const f = jsonFetch(200, { success: true, project: rawProject });
    await new ProjectsApi(httpWith(f)).setArchived({ projectId: 1, archived: true });
    expect(sent(f, 0).url).toBe(`${base}/1/archive`);
    expect(sent(f, 1).url).toBe(`${base}/1`);
    const g = jsonFetch(200, { success: true, project: rawProject });
    await new ProjectsApi(httpWith(g)).setArchived({ projectId: 1, archived: false });
    expect(sent(g, 0).url).toBe(`${base}/1/un-archive`);
  });

  it("update omits color when not given and tolerates a non-array team", async () => {
    const f = jsonFetch(200, { success: true, project: { ...rawProject, team: "nope" } });
    const updated = await new ProjectsApi(httpWith(f)).update({ projectId: 1, update: { name: "M2", isPrivate: false } });
    expect(sent(f, 0).json()).toEqual({ name: "M2", isPrivate: 0 });
    expect(updated.team).toEqual([]);
  });
});
