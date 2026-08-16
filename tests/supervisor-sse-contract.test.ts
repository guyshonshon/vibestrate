import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
