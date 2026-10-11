import { describe, it, expect } from "vitest";
import { ProjectsApi } from "../../src/api/projects.js";
import { jsonFetch, httpWith, sent, bearer } from "./helpers.js";

describe("ProjectsApi", () => {
  it("list GETs /tm/projects with the bearer and normalises to {id,name}", async () => {
    const f = jsonFetch(200, { success: true, projects: [{ id: 1, name: "Marketing" }] });
    expect(await new ProjectsApi(httpWith(f)).list()).toEqual([{ id: 1, name: "Marketing" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/tm/projects");
    expect(sent(f).init.headers).toMatchObject({ Authorization: bearer });
  });
});
