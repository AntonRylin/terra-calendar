import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as crypto from 'crypto';
import type { CalendarEvent, Recurrence } from './core/types.js';
import { expandOccurrences } from './core/occurrences.js';
import { createStore, type CalendarStore } from './store/store.js';

// The active data store (local JSON file or Supabase). Initialised in main().
let store: CalendarStore;

// Create MCP Server
const server = new Server(
  {
    name: "terra-calendar-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tool List
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_events",
        description: "List calendar events. If start_date and end_date are specified, the server will expand recurring events to return all individual occurrences within the range, sorted chronologically.",
        inputSchema: {
          type: "object",
          properties: {
            start_date: {
              type: "string",
              description: "Filter occurrences or events on/after this date (format: YYYY-MM-DD, e.g. 2026-06-15)",
            },
            end_date: {
              type: "string",
              description: "Filter occurrences or events on/before this date (format: YYYY-MM-DD, e.g. 2026-06-21)",
            },
            query: {
              type: "string",
              description: "Optional case-insensitive text search in event titles and descriptions",
            }
          },
        },
      },
      {
        name: "get_event",
        description: "Get details of a specific calendar event by its unique ID.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique event ID (UUID)",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "create_event",
        description: "Create a new event in the calendar.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the calendar event",
            },
            date: {
              type: "string",
              description: "Event date in YYYY-MM-DD format (local time)",
            },
            time: {
              type: "string",
              description: "Optional start time in HH:mm format (local time). If omitted, the event is treated as all-day.",
            },
            tz: {
              type: "string",
              description: "Optional IANA timezone code (e.g. Europe/Berlin) for timed events. Defaults to UTC if not specified.",
            },
            description: {
              type: "string",
              description: "Optional detailed description of the event",
            },
            color: {
              type: "string",
              description: "Optional hex color code or preset color (e.g., #ff375f)",
            },
            showOnMinimap: {
              type: "boolean",
              description: "Whether this event should be visible on the year circle minimap. Defaults to true.",
            },
            showInUpcoming: {
              type: "boolean",
              description: "Whether this event should be visible in the upcoming events stack. Defaults to true.",
            },
            recurrence: {
              type: "object",
              description: "Optional recurrence rule",
              properties: {
                unit: {
                  type: "string",
                  enum: ["week", "month", "year"],
                  description: "Unit of recurrence",
                },
                interval: {
                  type: "number",
                  description: "Interval of recurrence (e.g. 1 = every week/month/year, 2 = every 2nd, ...)",
                }
              },
              required: ["unit", "interval"],
            }
          },
          required: ["title", "date"],
        },
      },
      {
        name: "update_event",
        description: "Update details of an existing event in the calendar.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "ID of the event to update (UUID)",
            },
            title: {
              type: "string",
              description: "New event title",
            },
            date: {
              type: "string",
              description: "New event date (YYYY-MM-DD)",
            },
            time: {
              type: "string",
              description: "New event start time (HH:mm) or null/empty to convert to an all-day event",
            },
            tz: {
              type: "string",
              description: "New event timezone",
            },
            description: {
              type: "string",
              description: "New event description",
            },
            color: {
              type: "string",
              description: "New event color (hex code)",
            },
            showOnMinimap: {
              type: "boolean",
              description: "New value for showing the event on the year circle minimap",
            },
            showInUpcoming: {
              type: "boolean",
              description: "New value for showing the event in the upcoming events stack",
            },
            recurrence: {
              type: "object",
              description: "New recurrence rule or null to remove recurrence",
              properties: {
                unit: {
                  type: "string",
                  enum: ["week", "month", "year"],
                },
                interval: {
                  type: "number",
                }
              },
              required: ["unit", "interval"],
            },
            exdates: {
              type: "array",
              items: {
                type: "string"
              },
              description: "List of excluded occurrence dates in YYYY-MM-DD format"
            }
          },
          required: ["id"],
        },
      },
      {
        name: "delete_event",
        description: "Delete an event from the calendar.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "ID of the event to delete",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "search_events",
        description: "Search for calendar events by keyword in title or description.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query text",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Register Tool Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "list_events": {
      const events = await store.list();
      const startDate = args?.start_date as string | undefined;
      const endDate = args?.end_date as string | undefined;
      const query = args?.query as string | undefined;

      const lowerQuery = query?.toLowerCase();

      // Filter function for search queries
      const matchesQuery = (e: CalendarEvent) => {
        if (!lowerQuery) return true;
        return (
          e.title.toLowerCase().includes(lowerQuery) ||
          (e.description && e.description.toLowerCase().includes(lowerQuery))
        );
      };

      // Case 1: Start and End Dates provided. Expand occurrences.
      if (startDate && endDate) {
        const occurrences: any[] = [];

        for (const e of events) {
          if (!matchesQuery(e)) continue;

          const expanded = expandOccurrences(e, startDate, endDate);
          for (const date of expanded) {
            occurrences.push({
              occurrenceDate: date,
              id: e.id,
              title: e.title,
              description: e.description,
              time: e.time,
              tz: e.tz,
              color: e.color,
              recurrence: e.recurrence,
            });
          }
        }

        // Sort occurrences chronologically
        occurrences.sort((a, b) => {
          if (a.occurrenceDate !== b.occurrenceDate) {
            return a.occurrenceDate.localeCompare(b.occurrenceDate);
          }
          if (a.time && b.time) {
            return a.time.localeCompare(b.time);
          }
          return a.time ? 1 : -1; // timed events after all-day events
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                info: store.describe(),
                occurrences,
              }, null, 2),
            },
          ],
        };
      }

      // Case 2: No range. Return raw matching events.
      const filteredEvents = events.filter(matchesQuery);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              info: store.describe(),
              events: filteredEvents,
            }, null, 2),
          },
        ],
      };
    }

    case "get_event": {
      const id = args?.id as string;
      const events = await store.list();
      const event = events.find((e) => e.id === id);

      if (!event) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Event with ID ${id} not found.`
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(event, null, 2),
          },
        ],
      };
    }

    case "create_event": {
      const title = args?.title as string;
      const date = args?.date as string;
      const time = args?.time as string | undefined;
      const tz = args?.tz as string | undefined;
      const description = args?.description as string | undefined;
      const color = args?.color as string | undefined;
      const showOnMinimap = args?.showOnMinimap !== undefined ? (args.showOnMinimap as boolean) : undefined;
      const showInUpcoming = args?.showInUpcoming !== undefined ? (args.showInUpcoming as boolean) : undefined;
      const recurrence = args?.recurrence as Recurrence | undefined;

      // Validate date format YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid date format. Expected YYYY-MM-DD."
        );
      }

      // Validate time format HH:mm if provided
      if (time && !/^\d{2}:\d{2}$/.test(time)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid time format. Expected HH:mm."
        );
      }

      const now = new Date().toISOString();
      const newEvent: CalendarEvent = {
        id: crypto.randomUUID(),
        title,
        date,
        time: time || undefined,
        tz: time ? tz || "UTC" : undefined,
        description: description || undefined,
        color: color || undefined,
        showOnMinimap: showOnMinimap !== false ? undefined : false, // Store only if explicitly false (defaults to true)
        showInUpcoming: showInUpcoming !== false ? undefined : false, // Store only if explicitly false (defaults to true)
        recurrence: recurrence || null,
        createdAt: now,
        updatedAt: now,
      };

      await store.create(newEvent);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: "Event created successfully.",
              event: newEvent,
            }, null, 2),
          },
        ],
      };
    }

    case "update_event": {
      const id = args?.id as string;
      const events = await store.list();
      const existingEvent = events.find((e) => e.id === id);

      if (!existingEvent) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Event with ID ${id} not found.`
        );
      }

      const patch: Partial<CalendarEvent> = {};

      if (args?.title !== undefined) patch.title = args.title as string;
      if (args?.date !== undefined) {
        const d = args.date as string;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid date format. Expected YYYY-MM-DD."
          );
        }
        patch.date = d;
      }
      if (args?.time !== undefined) {
        const t = args.time as string | null;
        patch.time = t ? t : undefined;
        // If time is cleared, also clear tz
        if (!t) patch.tz = undefined;
      }
      if (args?.tz !== undefined) patch.tz = args.tz as string;
      if (args?.description !== undefined) patch.description = args.description as string || undefined;
      if (args?.color !== undefined) patch.color = args.color as string || undefined;
      if (args?.showOnMinimap !== undefined) {
        patch.showOnMinimap = args.showOnMinimap as boolean !== false ? undefined : false;
      }
      if (args?.showInUpcoming !== undefined) {
        patch.showInUpcoming = args.showInUpcoming as boolean !== false ? undefined : false;
      }
      if (args?.recurrence !== undefined) {
        const rec = args.recurrence as Recurrence | null;
        patch.recurrence = rec;
      }
      if (args?.exdates !== undefined) {
        patch.exdates = args.exdates as string[];
      }

      const updatedEvent: CalendarEvent = {
        ...existingEvent,
        ...patch,
        updatedAt: new Date().toISOString(),
      };

      await store.update(updatedEvent);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: "Event updated successfully.",
              event: updatedEvent,
            }, null, 2),
          },
        ],
      };
    }

    case "delete_event": {
      const id = args?.id as string;
      const removed = await store.remove(id);

      if (!removed) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Event with ID ${id} not found.`
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: `Event ${id} deleted successfully.`,
            }, null, 2),
          },
        ],
      };
    }

    case "search_events": {
      const query = args?.query as string;
      const lowerQuery = query.toLowerCase();
      const events = await store.list();

      const results = events.filter(
        (e) =>
          e.title.toLowerCase().includes(lowerQuery) ||
          (e.description && e.description.toLowerCase().includes(lowerQuery))
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              info: `Found ${results.length} events matching query "${query}"`,
              results,
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
  }
});

// Run Server
async function main() {
  console.error("Terra Calendar MCP server starting on stdio...");
  store = await createStore();
  await store.init();
  console.error(`Terra Calendar MCP server using ${store.describe()}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Terra Calendar MCP server connected and listening.");
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
