// Pure task-form state. The form is shared by "create" and "edit"
// modes — `existingId` differentiates them. The reducer handles
// field updates, focus cycling, and `validate()` returns either a
// `Ready` shape the view can pass to the service, or a list of
// human-readable errors.

import type { Priority } from "../../../roadmap/roadmap-types.js";

export type TaskFormMode = "create" | "edit";

export type TaskFormField =
  | "title"
  | "description"
  | "priority"
  | "effort"
  | "providerOverride"
  | "readOnly";

export const TASK_FORM_FIELDS: TaskFormField[] = [
  "title",
  "description",
  "priority",
  "effort",
  "providerOverride",
  "readOnly",
];

export type TaskFormState = {
  mode: TaskFormMode;
  existingId: string | null;
  title: string;
  description: string;
  priority: Priority;
  /** "" represents "not set" (effort is nullable on Task). */
  effort: "" | "low" | "medium" | "high";
  /** "" represents "no override". */
  providerOverride: string;
  readOnly: boolean;
  focused: TaskFormField;
  /** Errors keyed by field, set by validate() before the view repaints. */
  errors: Partial<Record<TaskFormField, string>>;
};

export type TaskFormSeed = Partial<
  Pick<
    TaskFormState,
    | "title"
    | "description"
    | "priority"
    | "effort"
    | "providerOverride"
    | "readOnly"
  >
>;

export function initTaskForm(
  mode: TaskFormMode,
  existingId: string | null,
  seed: TaskFormSeed = {},
): TaskFormState {
  return {
    mode,
    existingId,
    title: seed.title ?? "",
    description: seed.description ?? "",
    priority: seed.priority ?? "medium",
    effort: seed.effort ?? "",
    providerOverride: seed.providerOverride ?? "",
    readOnly: seed.readOnly ?? false,
    focused: "title",
    errors: {},
  };
}

export type TaskFormAction =
  | { type: "field"; field: TaskFormField; value: string | boolean }
  | { type: "focus"; field: TaskFormField }
  | { type: "focus.cycle"; direction: 1 | -1 }
  | { type: "errors"; value: Partial<Record<TaskFormField, string>> };

export function reduceTaskForm(
  state: TaskFormState,
  action: TaskFormAction,
): TaskFormState {
  switch (action.type) {
    case "field": {
      const next = { ...state } as TaskFormState;
      const { field, value } = action;
      switch (field) {
        case "title":
          next.title = String(value);
          break;
        case "description":
          next.description = String(value);
          break;
        case "priority":
          if (value === "low" || value === "medium" || value === "high") {
            next.priority = value;
          }
          break;
        case "effort":
          if (
            value === "" ||
            value === "low" ||
            value === "medium" ||
            value === "high"
          ) {
            next.effort = value;
          }
          break;
        case "providerOverride":
          next.providerOverride = String(value);
          break;
        case "readOnly":
          next.readOnly = Boolean(value);
          break;
      }
      // Clear that field's error as soon as the user types.
      if (next.errors[field]) {
        next.errors = { ...next.errors, [field]: undefined } as TaskFormState["errors"];
      }
      return next;
    }
    case "focus":
      return { ...state, focused: action.field };
    case "focus.cycle": {
      const idx = TASK_FORM_FIELDS.indexOf(state.focused);
      const next =
        TASK_FORM_FIELDS[
          (idx + action.direction + TASK_FORM_FIELDS.length) %
            TASK_FORM_FIELDS.length
        ] ?? "title";
      return { ...state, focused: next };
    }
    case "errors":
      return { ...state, errors: action.value };
  }
}

export type TaskFormReady = {
  title: string;
  description: string;
  priority: Priority;
  effort: "low" | "medium" | "high" | null;
  providerOverride: string | null;
  readOnly: boolean;
};

export type ValidateResult =
  | { ok: true; value: TaskFormReady }
  | { ok: false; errors: Partial<Record<TaskFormField, string>> };

/**
 * Pure validation: the form is ready when title is non-empty. Effort
 * "" becomes null; providerOverride trimmed-empty becomes null.
 */
export function validateTaskForm(state: TaskFormState): ValidateResult {
  const errors: Partial<Record<TaskFormField, string>> = {};
  const title = state.title.trim();
  if (!title) errors.title = "Title is required.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      description: state.description,
      priority: state.priority,
      effort: state.effort === "" ? null : state.effort,
      providerOverride:
        state.providerOverride.trim() === ""
          ? null
          : state.providerOverride.trim(),
      readOnly: state.readOnly,
    },
  };
}
