import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The supervisor turn streams over SSE, and the two ends have to agree on the
 * frame names. They did not.
 *
 * The route sends every event under its own kind - `emit: (event) =>
 * client.send(event.kind, event)` - so the wire names are the members of
 * `SupervisorTurnEvent`. The browser's parser switched on a different
 * vocabulary (`user`, `chunk`) and returned null from `default`, so `message`,
 * `phase`, `thinking`, `tool` and `answer` were all thrown away. Only `done`
 * arrived, which is why a turn still finished: the whole thread rides on that
 * one frame. What was lost was everything live - the answer appearing as it was
 * written, the thinking trail, and the persisted user message that replaces the
 * optimistic echo. Both ends typechecked, and the suite was green, because
 * nothing compared them.
 *
 * This compares them.
 */

const read = (p: string) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");

const TURN_SERVICE = read("src/supervisor/turn-service.ts");
const ROUTE = read("src/server/routes/supervisor.ts");
const CLIENT = read("src/ui/lib/api/supervisors.ts");

/** The event kinds the server can actually put on the wire, read off the union
 *  in turn-service.ts rather than hand-listed, so a new kind is covered the day
 *  it is added. */
function serverEventKinds(): string[] {
  const union = TURN_SERVICE.slice(
    TURN_SERVICE.indexOf("export type SupervisorTurnEvent"),
    TURN_SERVICE.indexOf("export type SupervisorTurnInput"),
  );
  const kinds = [...union.matchAll(/kind:\s*"([a-z]+)"/g)].map((m) => m[1] ?? "");
  return [...new Set(kinds)].sort();
}

/** The event names the browser's parser branches on. */
function clientHandledNames(): string[] {
  const fn = CLIENT.slice(CLIENT.indexOf("function toTurnEvent"), CLIENT.indexOf("export const supervisorControlApi"));
  const names = [...fn.matchAll(/case\s+"([a-z]+)":/g)].map((m) => m[1] ?? "");
  return [...new Set(names)].sort();
}

describe("the supervisor turn stream has one vocabulary", () => {
  it("reads a non-empty set of kinds from each side", () => {
    // Guards the scanners: a regex that silently matched nothing would make the
    // comparison below vacuously true, which is the exact failure mode that let
    // the mismatch ship.
    expect(serverEventKinds().length).toBeGreaterThanOrEqual(5);
    expect(clientHandledNames().length).toBeGreaterThanOrEqual(5);
  });

  it("sends frames under the event's own kind", () => {
    // If this stops being true the names below are compared against nothing.
    expect(ROUTE).toContain("client.send(event.kind, event)");
  });

  it("leaves no server event the browser silently discards", () => {
    const unhandled = serverEventKinds().filter((k) => !clientHandledNames().includes(k));
    expect({ unhandled }).toEqual({ unhandled: [] });
  });

  it("branches on no name the server never sends", () => {
    // The other direction: a case for a name that does not exist is dead code
    // that reads like working support. `user` and `chunk` were exactly that.
    const phantom = clientHandledNames().filter((n) => !serverEventKinds().includes(n));
    expect({ phantom }).toEqual({ phantom: [] });
  });

  it("carries the failure reason on the error frame, not a placeholder", () => {
    // The server sends `{kind:"error", message}`. Reading only `body.error`
    // meant every real reason was replaced by a hard-coded sentence.
    const fn = CLIENT.slice(CLIENT.indexOf('case "error":'), CLIENT.indexOf('case "phase":'));
    expect(fn).toContain("body.message");
  });
});

/**
 * The same comparison for every OTHER stream this server opens.
 *
 * The supervisor's was the only mismatch, but it was invisible for the same
 * reason all of them would be: an SSE name is a string on one side and a string
 * on the other, and nothing in the type system connects them. A name the server
 * sends and nobody listens for is a feature that silently does nothing.
 *
 * Consumers are deliberately partial - LiveOutputPanel wants `raw`, the
 * timeline wants `chunk`, neither wants both - so the invariant is "at least
 * one listener somewhere in the UI", not "every consumer handles everything".
 */
describe("every SSE frame the server sends has a listener", () => {
  const SERVER_FILES = [
    "src/server/sse.ts",
    "src/server/sse-aggregate.ts",
    "src/server/routes/codebase-events.ts",
  ];

  /** Literal names passed to client.send(...). `event.kind` call sites are
   *  dynamic and covered by the supervisor comparison above. */
  function sentNames(): string[] {
    const names: string[] = [];
    for (const f of SERVER_FILES) {
      for (const m of read(f).matchAll(/\bsend\(\s*"([a-z-]+)"/g)) names.push(m[1] ?? "");
    }
    return [...new Set(names)].sort();
  }

  function listenedNames(): string[] {
    const dir = fileURLToPath(new URL("../src/ui", import.meta.url));
    const names: string[] = [];
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = readFileSync(full, "utf8");
          for (const m of src.matchAll(/addEventListener\(\s*"([a-z-]+)"/g)) names.push(m[1] ?? "");
          for (const m of src.matchAll(/case\s+"([a-z-]+)":/g)) names.push(m[1] ?? "");
        }
      }
    };
    walk(dir);
    return [...new Set(names)];
  }

  it("finds names on both sides", () => {
    expect(sentNames().length).toBeGreaterThanOrEqual(4);
    expect(listenedNames().length).toBeGreaterThanOrEqual(4);
  });

  it("leaves no frame with nobody listening", () => {
    const listened = new Set(listenedNames());
    const orphaned = sentNames().filter((n) => !listened.has(n));
    expect({ orphaned }).toEqual({ orphaned: [] });
  });
});
