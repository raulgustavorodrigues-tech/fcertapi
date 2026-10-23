import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { agentLiveness } from "./commands";
const now = Date.parse("2026-10-23T12:00:00Z");
const ago = (s: number) => new Date(now - s * 1000).toISOString();
describe("agentLiveness", () => {
  it("120s = online", () => expect(agentLiveness(ago(120), now)).toBe("online"));
  it("6 min = instável", () => expect(agentLiveness(ago(360), now)).toBe("stale"));
  it("11 min = offline", () => expect(agentLiveness(ago(660), now)).toBe("offline"));
});
