import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ShapeOutput, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { jsonReply, errorReply } from "./reply.js";

export interface JsonToolConfig<Shape extends ZodRawShapeCompat> {
  description: string;
  inputSchema: Shape;
  annotations?: ToolAnnotations;
}

/**
 * Registers a tool whose handler returns the value to serialise, or throws. Every throw — a
 * ResolutionError with its candidates, an API error, a bad argument — becomes an error reply,
 * so a handler holds only its happy path. Typed like the SDK's own ToolCallback. Positional like the SDK's registerTool it wraps.
 */
export function registerJsonTool<Shape extends ZodRawShapeCompat>(
  server: McpServer,
  name: string,
  config: JsonToolConfig<Shape>,
  run: (args: ShapeOutput<Shape>) => Promise<unknown>,
): void {
  const callback = async (args: ShapeOutput<Shape>) => {
    try {
      return jsonReply(await run(args));
    } catch (err) {
      return errorReply(err);
    }
  };
  // ToolCallback<Shape> is a conditional type TypeScript cannot resolve for a generic Shape;
  // for any object shape it is exactly (args: ShapeOutput<Shape>, extra) => result.
  server.registerTool<ZodRawShapeCompat, Shape>(name, config, callback as unknown as ToolCallback<Shape>);
}
