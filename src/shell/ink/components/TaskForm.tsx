import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import {
  TASK_FORM_FIELDS,
  type TaskFormAction,
  type TaskFormField,
  type TaskFormState,
} from "../roadmap/form.js";
import { FOCAL_CARD_PROPS } from "../theme.js";

export type ProfileOption = { id: string; hint: string };

type Props = {
  form: TaskFormState;
  dispatch: React.Dispatch<TaskFormAction>;
  profiles: ProfileOption[];
  onSubmit: () => void;
  onCancel: () => void;
};

const FIELD_LABELS: Record<TaskFormField, string> = {
  title: "title",
  description: "description",
  priority: "priority",
  profileOverride: "profile override",
  readOnly: "read-only",
};

const PRIORITY_VALUES = ["low", "medium", "high"] as const;

export function TaskForm({ form, dispatch, profiles, onSubmit, onCancel }: Props) {
  const isCreate = form.mode === "create";
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Text bold color="cyan">
        {isCreate ? "new task" : `edit task`}
      </Text>
      <Text dimColor>
        <Text color="cyan">↑↓</Text> or <Text color="cyan">tab</Text> next field
        · <Text color="cyan">↵</Text> next/save · <Text color="cyan">←→</Text>
        on enums · <Text color="cyan">space</Text> toggles flags
      </Text>
      <Box marginTop={1} flexDirection="column">
        {TASK_FORM_FIELDS.map((field) => (
          <FieldRow
            key={field}
            field={field}
            label={FIELD_LABELS[field]}
            form={form}
            dispatch={dispatch}
            profiles={profiles}
          />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          <Text color="cyan">↵</Text> on last field saves ·{" "}
          <Text color="cyan">Esc</Text> cancel
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
  profiles,
}: {
  field: TaskFormField;
  label: string;
  form: TaskFormState;
  dispatch: React.Dispatch<TaskFormAction>;
  profiles: ProfileOption[];
}) {
  const focused = form.focused === field;
  const focusMark = focused ? (
    <Text color="cyan">▸</Text>
  ) : (
    <Text>{" "}</Text>
  );
  return (
    <Box>
      {focusMark}
      <Text dimColor>{" "}{label.padEnd(18)}</Text>
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
        focused ? (
          <TextInput
            value={form.description.replace(/\n/g, " ")}
            onChange={(v) =>
              dispatch({ type: "field", field: "description", value: v })
            }
            placeholder="one-line summary"
          />
        ) : (
          <Text>
            {form.description ? (
              <Text wrap="truncate-end">{form.description.replace(/\n/g, " ")}</Text>
            ) : (
              <Text dimColor>(empty)</Text>
            )}
          </Text>
        )
      ) : field === "priority" ? (
        <EnumPicker
          values={PRIORITY_VALUES as readonly string[]}
          value={form.priority}
          focused={focused}
          onChange={(v) => dispatch({ type: "field", field: "priority", value: v })}
        />
      ) : field === "profileOverride" ? (
        <Box flexDirection="column">
          <EnumPicker
            values={["", ...profiles.map((p) => p.id)]}
            value={form.profileOverride}
            focused={focused}
            emptyLabel="(default)"
            onChange={(v) =>
              dispatch({ type: "field", field: "profileOverride", value: v })
            }
          />
          {focused && form.profileOverride ? (
            <Text dimColor>
              {"   "}
              {profiles.find((p) => p.id === form.profileOverride)?.hint ?? ""}
            </Text>
          ) : null}
        </Box>
      ) : (
        // readOnly toggle
        <Text>
          {focused ? (
            <Text color="cyan">{form.readOnly ? "◉" : "○"}</Text>
          ) : (
            <Text dimColor>{form.readOnly ? "◉" : "○"}</Text>
          )}
          <Text> read-only</Text>
          {focused ? (
            <Text dimColor>   space toggles</Text>
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
  emptyLabel = "(none)",
  onChange,
}: {
  values: readonly string[];
  value: string;
  focused: boolean;
  emptyLabel?: string;
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
            {v === "" ? emptyLabel : v}
          </Text>
        </React.Fragment>
      ))}
      {focused ? <Text dimColor>   ←/→ cycle</Text> : null}
    </Box>
  );
  void onChange;
}
