import { describe, it, expect, vi } from "vitest";
import { registerCommentTools } from "../../src/tools/comments.js";
import { toolHarness, reply } from "../helpers/tool-harness.js";

const comment = { id: 9, parentId: null, authorId: "u1", markdown: "hi", createdAt: "x", updatedAt: "x" };

describe("comment tools", () => {
  it("weeek_list_comments pages with the defaults", async () => {
    const listComments = vi.fn(async () => ({ comments: [comment], hasMore: false }));
    const h = toolHarness(registerCommentTools, { tasks: { listComments } });
    expect(reply(await h.call("weeek_list_comments", { id: 78 }))).toEqual({ comments: [comment], hasMore: false });
    expect(listComments).toHaveBeenCalledWith({ taskId: 78, limit: 20, offset: 0 });
  });

  it("weeek_add_comment posts markdown, replying when reply_to is given", async () => {
    const addComment = vi.fn(async () => comment);
    const h = toolHarness(registerCommentTools, { tasks: { addComment } });
    await h.call("weeek_add_comment", { id: 78, markdown: "hi" });
    expect(addComment).toHaveBeenCalledWith({ taskId: 78, markdown: "hi", parentId: undefined });
    await h.call("weeek_add_comment", { id: 78, markdown: "re", reply_to: 9 });
    expect(addComment).toHaveBeenLastCalledWith({ taskId: 78, markdown: "re", parentId: 9 });
  });

  it("weeek_delete_comment needs confirm:true and then deletes", async () => {
    const removeComment = vi.fn(async () => undefined);
    const h = toolHarness(registerCommentTools, { tasks: { removeComment } });
    expect(() => h.call("weeek_delete_comment", { id: 78, comment_id: 9 })).toThrow(/confirm/);
    expect(removeComment).not.toHaveBeenCalled();
    expect(reply(await h.call("weeek_delete_comment", { id: 78, comment_id: 9, confirm: true }))).toEqual({ success: true });
    expect(removeComment).toHaveBeenCalledWith({ taskId: 78, commentId: 9 });
  });

  it("weeek_add_comment turns a client failure into an error reply", async () => {
    const h = toolHarness(registerCommentTools, { tasks: { addComment: vi.fn(async () => { throw new Error("boom"); }) } });
    const res = await h.call("weeek_add_comment", { id: 78, markdown: "hi" });
    expect(res.isError).toBe(true);
    expect(reply(res).error).toBe("boom");
  });
});
