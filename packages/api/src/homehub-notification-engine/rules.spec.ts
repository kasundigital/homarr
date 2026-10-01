import { describe, expect, test } from "vitest";

import { evaluateNotification, matchesRule } from "./rules";
import type { NotificationRule } from "./types";

describe("HomeHub notification rules", () => {
  test("ignores a matching sender", () => {
    const result = evaluateNotification(
      {
        source: "sms",
        sender: "DialogPromo",
        message: "Weekend promotion",
      },
      {
        defaultChannelIds: ["telegram"],
        keepIgnoredInHistory: true,
        rules: [
          {
            id: "ignore-dialog",
            name: "Ignore Dialog promo",
            enabled: true,
            priority: 100,
            stopProcessing: true,
            match: "all",
            conditions: [
              {
                field: "sender",
                operator: "contains",
                value: "dialogpromo",
                caseSensitive: false,
              },
            ],
            actions: [{ type: "ignore" }],
          },
        ],
      },
    );

    expect(result.disposition).toBe("ignored");
    expect(result.channelIds).toEqual([]);
    expect(result.matchedRuleIds).toEqual(["ignore-dialog"]);
  });

  test("supports regex matching and mutation actions", () => {
    const result = evaluateNotification(
      {
        source: "monitor",
        message: "Disk usage reached 92%",
        severity: "warning",
      },
      {
        defaultChannelIds: ["telegram"],
        keepIgnoredInHistory: true,
        rules: [
          {
            id: "critical-disk",
            name: "Critical disk",
            enabled: true,
            priority: 100,
            match: "all",
            conditions: [
              {
                field: "message",
                operator: "regex",
                value: "Disk usage reached 9[0-9]%",
              },
            ],
            actions: [
              { type: "setSeverity", severity: "critical" },
              { type: "addTag", tag: "storage" },
              { type: "send", channels: ["telegram"] },
            ],
          },
        ],
      },
    );

    expect(result.disposition).toBe("send");
    expect(result.notification.severity).toBe("critical");
    expect(result.notification.tags).toContain("storage");
  });

  test("supports scheduled rules including overnight windows", () => {
    const rule: NotificationRule = {
      id: "overnight",
      name: "Overnight rule",
      enabled: true,
      priority: 1,
      match: "all",
      conditions: [],
      actions: [{ type: "ignore" }],
      schedule: {
        timezone: "UTC",
        days: [4],
        start: "22:00",
        end: "06:00",
      },
    };

    expect(matchesRule({ source: "test", message: "x" }, rule, new Date("2026-10-01T23:00:00Z"))).toBe(true);
    expect(matchesRule({ source: "test", message: "x" }, rule, new Date("2026-10-01T12:00:00Z"))).toBe(false);
  });
});
