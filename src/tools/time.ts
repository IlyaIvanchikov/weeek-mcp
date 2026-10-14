import { z } from "zod";
import type { ToolContext } from "../toolsets/types.js";
import type { TimeEntryFields } from "../client.js";
import { parseDay } from "../dates.js";
import { destructiveAnnotations } from "./constants.js";
import { confirmation, nameOrId, taskId } from "./inputs.js";
import { registerJsonTool } from "./json-tool.js";

const entryId = z.string().min(1);
const minutes = z.number().int().min(1).max(1440).describe("Minutes; the API caps one entry at a day.");

/** The `time` toolset: WEEEK's timer and manual time entries on tasks. */
export function registerTimeTools({ server, client, resolver }: ToolContext): void {
  registerJsonTool(server, "weeek_set_timer", {
    description: "Start (running:true) or stop (running:false) WEEEK's time tracker on a task for the token's owner. Stopping records the elapsed time as an entry; weeek_get_task lists a task's `timeEntries`.",
    inputSchema: { id: taskId, running: z.boolean() },
  }, async (args) => (args.running ? client.tasks.startTimer(args.id) : client.tasks.stopTimer(args.id)));

  registerJsonTool(server, "weeek_add_time_entry", {
    description: "Record time spent on a WEEEK task: a natural-language `date`, the `minutes`, optionally the `member` it belongs to (name or id; default: the token's owner) and whether it is `overtime`.",
    inputSchema: { id: taskId, date: z.string(), minutes, member: nameOrId.optional(), overtime: z.boolean().default(false) },
  }, async (args) => {
    const userId = args.member === undefined ? (await client.user.me()).id : await resolver.resolve({ kind: "member", value: args.member });
    return client.tasks.addTimeEntry({ taskId: args.id, entry: { userId, date: parseDay(args.date), duration: args.minutes, isOvertime: args.overtime } });
  });

  registerJsonTool(server, "weeek_update_time_entry", {
    description: "Change a time entry on a WEEEK task (`entry_id` from the task's `timeEntries`): any of date, minutes, member, overtime. Fields you omit keep their current value.",
    inputSchema: { id: taskId, entry_id: entryId, date: z.string().optional(), minutes: minutes.optional(), member: nameOrId.optional(), overtime: z.boolean().optional() },
  }, async (args) => {
    // The API's PUT replaces all four fields, so the current entry is read and merged first.
    const task = await client.tasks.get(args.id);
    const currentEntry = task.timeEntries.find((candidate) => candidate.id === args.entry_id);
    if (!currentEntry) throw new Error(`time entry ${args.entry_id} is not on task ${args.id}`);
    const entry: TimeEntryFields = {
      userId: args.member === undefined ? currentEntry.userId : await resolver.resolve({ kind: "member", value: args.member }),
      date: args.date === undefined ? currentEntry.date : parseDay(args.date),
      duration: args.minutes ?? currentEntry.duration,
      isOvertime: args.overtime ?? currentEntry.isOvertime,
    };
    return client.tasks.updateTimeEntry({ taskId: args.id, timeEntryId: args.entry_id, entry });
  });

  registerJsonTool(server, "weeek_delete_time_entry", {
    description: "Delete a time entry from a WEEEK task. Irreversible; requires confirm:true.",
    inputSchema: { id: taskId, entry_id: entryId, confirm: confirmation },
    annotations: destructiveAnnotations,
  }, async (args) => client.tasks.removeTimeEntry({ taskId: args.id, timeEntryId: args.entry_id }));
}
