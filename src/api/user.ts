import type { HttpClient } from "../http.js";
import { operations } from "../operations.js";
import { toProfile } from "./responses.js";
import type { Profile } from "./types.js";

export class UserApi {
  constructor(private http: HttpClient) {}

  /** The owner of the token the server runs with. */
  async me(): Promise<Profile> {
    const json = await this.http.execute<{ user: unknown }>(operations.user.me);
    return toProfile(json.user);
  }
}
