import { describe, it, expect } from "vitest";
import { UserApi } from "../../src/api/user.js";
import { jsonFetch, httpWith, sent } from "../helpers/http.js";

describe("UserApi", () => {
  it("me GETs /user/me and normalises the profile", async () => {
    const f = jsonFetch(200, { success: true, user: { id: "u1", email: "i@x.y", firstName: "Ilya", lastName: "I", language: "en", timeZone: "Europe/Minsk", logoLink: "" } });
    expect(await new UserApi(httpWith(f)).me()).toEqual({ id: "u1", name: "Ilya I", email: "i@x.y", language: "en", timeZone: "Europe/Minsk" });
    expect(sent(f).url).toBe("https://api.weeek.net/public/v1/user/me");
  });
});
