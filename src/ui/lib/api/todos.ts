// Harvested code TODOs: review, promote, dismiss.
//
// The GET returns the COMPUTED view, so the client never reconciles promotion
// state itself. Mutations return the fresh overview so a caller does not have to
// chase a second request.
import { jsonGet, jsonPost } from "./http.js";
import type { TodoOverview, TodoPromoteResult } from "../types.js";

export const todosApi = {
  async getTodos(): Promise<TodoOverview> {
    return jsonGet<TodoOverview>("/api/todos");
  },
  /** Create a card per selection. Returns three buckets rather than throwing on
   *  the first bad item, so partial success is reportable. */
  async promoteTodos(input: {
    selections: Array<{
      fingerprint: string;
      overrides?: { title?: string; priority?: "low" | "medium" | "high" };
    }>;
  }): Promise<TodoPromoteResult> {
    return jsonPost<TodoPromoteResult>("/api/todos/promote", input);
  },
  async dismissTodos(fingerprints: string[]): Promise<TodoOverview> {
    return jsonPost<TodoOverview>("/api/todos/dismiss", { fingerprints });
  },
  async undismissTodos(fingerprints: string[]): Promise<TodoOverview> {
    return jsonPost<TodoOverview>("/api/todos/undismiss", { fingerprints });
  },
};
