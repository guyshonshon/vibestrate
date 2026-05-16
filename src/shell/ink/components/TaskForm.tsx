import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import {
  TASK_FORM_FIELDS,
  type TaskFormAction,
  type TaskFormField,
  type TaskFormState,
} from "../roadmap/form.js";

type Props = {
  form: TaskFormState;
  dispatch: React.Dispatch<TaskFormAction>;
  onSubmit: () => void;
  onCancel: () => void;
  onEditDescription: () => void;
};

const FIELD_LABELS: Record<TaskFormField, string> = {
  title: "title",
  description: "description",
  priority: "priority",
  effort: "effort",
  providerOverride: "provider override",
  readOnly: "read-only",
};

const PRIORITY_VALUES = ["low", "medium", "high"] as const;
const EFFORT_VALUES = ["", "low", "medium", "high"] as const;

export function TaskForm({
  form,
  dispatch,
  onSubmit,
  onCancel,
  onEditDescription,
}: Props) {
  const isCreate = form.mode === "create";
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold>{isCreate ? "New task" : `Edit ${form.existingId}`}</Text>
      <Text dimColor>
        tab cycles fields · D edit description in $EDITOR · Enter saves · Esc cancels
      </Text>
      <Box marginTop={1} flexDirection="column">
        {TASK_FORM_FIELDS.map((field) => (
          <FieldRow
            key={field}
            field={field}
            label={FIELD_LABELS[field]}
            form={form}
            dispatch={dispatch}
          />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          [Enter] save · [Esc] cancel · [D] edit description
        </Text>
      </Box>
      {Object.values(form.errors).some((v) => v) ? (
        <Box marginTop={1} flexDirection="column">
          {Object.entries(form.errors).map(([k, v]) =>
            v ? (
              <Text key={k} color="red">
                {k}: {v}
              </Text>
            ) : null,
          )}
        </Box>
      ) : null}
    </Box>
  );
  // onSubmit / onCancel are driven by the parent's useInput; the props
  // are accepted for API symmetry. Silence the unused warnings.
  void onSubmit;
  void onCancel;
}

function FieldRow({
  field,
  label,
  form,
  dispatch,
}: {
  field: TaskFormField;
  label: string;
  form: TaskFormState;
  dispatch: React.Dispatch<TaskFormAction>;
}) {
  const focused = form.focused === field;
  const focusMark = focused ? <Text color="cyan">›</Text> : <Text>{" "}</Text>;
  return (
    <Box>
      {focusMark}
      <Text dimColor>{" "}{label.padEnd(20)}</Text>
      {field === "title" ? (
        focused ? (
          <TextInput
            value={form.title}
            onChange={(v) => dispatch({ type: "field", field: "title", value: v })}
            placeholder="Task title"
          />
        ) : (
          <Text>{form.title || <Text dimColor>(required)</Text>}</Text>
        )
      ) : field === "description" ? (
        <Box flexDirection="column">
          <Text>
            {form.description ? (
              <Text>
                {form.description.split("\n").length} line
                {form.description.split("\n").length === 1 ? "" : "s"} ·{" "}
                {form.description.length} chars
              </Text>
            ) : (
              <Text dimColor>(empty)</Text>
            )}
          </Text>
          {focused ? (
            <Text dimColor>press D to edit in $EDITOR</Text>
          ) : null}
        </Box>
      ) : field === "priority" ? (
        <EnumPicker
          values={PRIORITY_VALUES as readonly string[]}
          value={form.priority}
          focused={focused}
          onChange={(v) => dispatch({ type: "field", field: "priority", value: v })}
        />
      ) : field === "effort" ? (
        <EnumPicker
          values={EFFORT_VALUES as readonly string[]}
          value={form.effort}
          focused={focused}
          onChange={(v) => dispatch({ type: "field", field: "effort", value: v })}
        />
      ) : field === "providerOverride" ? (
        focused ? (
          <TextInput
            value={form.providerOverride}
            onChange={(v) =>
              dispatch({ type: "field", field: "providerOverride", value: v })
            }
            placeholder="(none)"
          />
        ) : (
          <Text>
            {form.providerOverride || <Text dimColor>(none)</Text>}
          </Text>
        )
      ) : (
        // readOnly toggle
        <Text>
          {focused ? (
            <Text color="cyan">
              {form.readOnly ? "[x] " : "[ ] "}
            </Text>
          ) : (
            <Text dimColor>{form.readOnly ? "[x] " : "[ ] "}</Text>
          )}
          read-only
          {focused ? (
            <Text dimColor>  (space toggles)</Text>
          ) : null}
        </Text>
      )}
    </Box>
  );
}

function EnumPicker({
  values,
  value,
  focused,
  onChange,
}: {
  values: readonly string[];
  value: string;
  focused: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Box>
      {values.map((v, i) => (
        <React.Fragment key={`${v}-${i}`}>
          {i > 0 ? <Text dimColor>  </Text> : null}
          <Text
            color={focused && v === value ? "cyan" : undefined}
            dimColor={!focused && v !== value}
            bold={v === value}
          >
            {v === "" ? "(none)" : v}
          </Text>
        </React.Fragment>
      ))}
      {focused ? <Text dimColor>   ←/→ cycle</Text> : null}
    </Box>
  );
  void onChange;
}
