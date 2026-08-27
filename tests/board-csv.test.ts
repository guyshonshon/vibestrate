import { describe, it, expect } from "vitest";
import { toCsv, parseCsv, parseBoardCsv } from "../src/roadmap/board-csv.js";
import type { Task } from "../src/roadmap/roadmap-types.js";

/**
 * Moving a backlog in and out as a file.
 *
 * CSV rather than the Jira/Trello/Linear APIs, because every one of those is a
 * hosted service needing a stored credential - a posture decision this project
 * has not made, and one that should not be made by quietly shipping a
 * connector. A file needs no account, no egress, and works offline.
 *
 * The tests that matter are the ones about not corrupting a human's data: a
 * description pasted out of a tracker is full of commas, quotes and newlines,
 * and a naive split mangles exactly those rows.
 */
const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1",
    title: "Ship it",
    description: "",
    status: "backlog",
    priority: "medium",
    stage: null,
    ...over,
  }) as Task;

describe("writing CSV", () => {
  it("quotes a field containing a comma", () => {
    const out = toCsv([task({ description: "one, two" })]);
    expect(out).toContain('"one, two"');
  });

  it("doubles inner quotes rather than breaking the field", () => {
    const out = toCsv([task({ title: 'He said "no"' })]);
    expect(out).toContain('"He said ""no"""');
  });

  it("survives a newline inside a description", () => {
    const out = toCsv([task({ description: "line one\nline two" })]);
    // Round-trips: the multi-line field stays ONE field.
    const rows = parseCsv(out);
    expect(rows).toHaveLength(2);
    expect(rows[1]![2]).toBe("line one\nline two");
  });

  it("round-trips a task through both directions", () => {
    const csv = toCsv([task({ title: "A, B", description: 'say "hi"', stage: "In design" })]);
    const { rows } = parseBoardCsv(csv);
    expect(rows[0]?.title).toBe("A, B");
    expect(rows[0]?.description).toBe('say "hi"');
    expect(rows[0]?.stage).toBe("In design");
  });
});

describe("reading someone else's export", () => {
  it("matches columns by name, not position", () => {
    // Every tracker emits its own column order.
    const { rows } = parseBoardCsv("priority,title,status\nhigh,Fix login,backlog\n");
    expect(rows[0]).toMatchObject({ title: "Fix login", priority: "high", status: "backlog" });
  });

  it("accepts Jira's names for the two columns it calls something else", () => {
    const { rows } = parseBoardCsv("key,summary\nPROJ-12,Fix login\n");
    expect(rows[0]?.title).toBe("Fix login");
    expect(rows[0]?.foreignId).toBe("PROJ-12");
  });

  it("never adopts a foreign id as the task id", () => {
    // Ids here name a run's branch. Letting an external system choose them
    // would let it name things inside .vibestrate/.
    const { rows } = parseBoardCsv("id,title\nPROJ-12,Fix login\n");
    expect(rows[0]?.foreignId).toBe("PROJ-12");
    expect(Object.keys(rows[0]!)).not.toContain("taskId");
  });

  it("turns an unrecognised status into a STAGE rather than dropping it", () => {
    // "In Review" has no counterpart in the run-status enum, but it is exactly
    // what the human-owned stage axis is for.
    const { rows } = parseBoardCsv("title,status\nFix login,In Review\n");
    expect(rows[0]?.status).toBeNull();
    expect(rows[0]?.stage).toBe("In Review");
  });

  it("keeps a status it does recognise", () => {
    const { rows } = parseBoardCsv("title,status\nFix login,ready\n");
    expect(rows[0]?.status).toBe("ready");
  });

  it("skips one bad row instead of refusing the file", () => {
    // A hand-edited export usually has one bad row. Refusing all two hundred
    // because of it helps nobody.
    const { rows, skipped } = parseBoardCsv("title\nGood one\n\nAnother\n");
    expect(rows.map((r) => r.title)).toEqual(["Good one", "Another"]);
    expect(skipped).toHaveLength(0);
  });

  it("reports a row with no title, by line number", () => {
    const { rows, skipped } = parseBoardCsv("title,status\n,backlog\nReal,backlog\n");
    expect(rows).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ line: 2, reason: "no title" });
  });

  it("says why a file with no title column is unusable", () => {
    const { rows, skipped } = parseBoardCsv("foo,bar\n1,2\n");
    expect(rows).toHaveLength(0);
    expect(skipped[0]?.reason).toContain("title");
  });

  it("ignores a priority it does not have", () => {
    const { rows } = parseBoardCsv("title,priority\nX,Blocker\n");
    expect(rows[0]?.priority).toBeNull();
  });
});
