import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile } from "fs/promises";
import { resolve, relative } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const CONTEXT_PATH = resolve(REPO_ROOT, "CONTEXT.md");

const server = new Server(
  { name: "parallax", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_file",
      description:
        "Read and return the full contents of any file in the Parallax repo.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to the repo root (e.g. 'CONTEXT.md', 'mcp/index.js')",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "append_session_entry",
      description:
        "Append a new dated session entry to CONTEXT.md and update the Last Updated timestamp.",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "Markdown content of the session entry. Should follow the established format: ## Session Entry — YYYY-MM-DD, then the body.",
          },
        },
        required: ["content"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "read_file") {
    const target = resolve(REPO_ROOT, args.path);
    const rel = relative(REPO_ROOT, target);

    if (rel.startsWith("..") || rel.startsWith("/")) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error: path must be within the repo root." }],
      };
    }

    try {
      const content = await readFile(target, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error reading file: ${err.message}` }],
      };
    }
  }

  if (name === "append_session_entry") {
    try {
      const today = new Date().toISOString().slice(0, 10);
      let current = await readFile(CONTEXT_PATH, "utf-8");

      // Strip the trailing last-updated line so we can rewrite it cleanly
      current = current.replace(/\n\*Last updated:.*\*\s*$/, "").trimEnd();

      const entry = [
        "",
        "",
        "---",
        "",
        args.content.trim(),
        "",
        "---",
        "",
        `*Last updated: ${today}*`,
      ].join("\n");

      await writeFile(CONTEXT_PATH, current + entry, "utf-8");

      return {
        content: [{ type: "text", text: `Session entry appended to CONTEXT.md (${today}).` }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error writing CONTEXT.md: ${err.message}` }],
      };
    }
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
