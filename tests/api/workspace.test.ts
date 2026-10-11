import { describe, it, expect } from "vitest";
import { WorkspaceApi } from "../../src/api/workspace.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

describe("WorkspaceApi", () => {
  it("listMembers GETs /ws/members and joins first + last name", async () => {
    const f = jsonFetch(200, { success: true, members: [{ id: "u9", firstName: "Ilya", lastName: "I" }, { id: "u2", email: "x@y.z" }] });
    expect(await new WorkspaceApi(httpWith(f)).listMembers()).toEqual([{ id: "u9", name: "Ilya I" }, { id: "u2", name: "x@y.z" }]);
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/ws/members");
  });
});
