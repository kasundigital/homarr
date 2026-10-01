import type {
  IncomingNotification,
  NotificationCondition,
  NotificationEvaluation,
  NotificationMatchField,
  NotificationPreferences,
  NotificationRule,
  NotificationRuleSchedule,
} from "./types";

const normalize = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

const readField = (notification: IncomingNotification, field: NotificationMatchField): string | string[] => {
  switch (field) {
    case "source":
      return notification.source;
    case "sender":
      return notification.sender ?? "";
    case "title":
      return notification.title ?? "";
    case "message":
      return notification.message;
    case "severity":
      return notification.severity ?? "info";
    case "category":
      return notification.category ?? "";
    case "account":
      return notification.account ?? "";
    case "tags":
      return notification.tags ?? [];
  }
};

const compareText = (actual: string, expected: string, condition: NotificationCondition): boolean => {
  const caseSensitive = condition.caseSensitive ?? false;
  const left = caseSensitive ? actual : actual.toLocaleLowerCase();
  const right = caseSensitive ? expected : expected.toLocaleLowerCase();

  switch (condition.operator) {
    case "equals":
      return left === right;
    case "contains":
      return left.includes(right);
    case "startsWith":
      return left.startsWith(right);
    case "endsWith":
      return left.endsWith(right);
    case "regex": {
      try {
        return new RegExp(expected, caseSensitive ? "" : "i").test(actual);
      } catch {
        return false;
      }
    }
    case "in":
      return false;
  }
};

const getLocalParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    day: weekdayMap[value("weekday")] ?? 0,
    time: value("hour") + ":" + value("minute"),
  };
};

const scheduleMatches = (schedule: NotificationRuleSchedule | undefined, date: Date): boolean => {
  if (!schedule) return true;

  const timezone = schedule.timezone || "UTC";
  let local: { day: number; time: string };
  try {
    local = getLocalParts(date, timezone);
  } catch {
    return false;
  }

  if (schedule.days?.length && !schedule.days.includes(local.day)) return false;
  if (!schedule.start || !schedule.end) return true;

  if (schedule.start <= schedule.end) {
    return local.time >= schedule.start && local.time <= schedule.end;
  }

  return local.time >= schedule.start || local.time <= schedule.end;
};

export const matchesCondition = (notification: IncomingNotification, condition: NotificationCondition): boolean => {
  const actual = readField(notification, condition.field);
  const expected = Array.isArray(condition.value) ? condition.value.map(normalize) : [normalize(condition.value)];

  let matched = false;

  if (Array.isArray(actual)) {
    const actualValues = actual.map(normalize);

    if (condition.operator === "in") {
      matched = actualValues.some((value) =>
        expected.some((item) =>
          (condition.caseSensitive ?? false) ? value === item : value.toLocaleLowerCase() === item.toLocaleLowerCase(),
        ),
      );
    } else {
      matched = actualValues.some((value) => expected.some((item) => compareText(value, item, condition)));
    }
  } else if (condition.operator === "in") {
    const value = normalize(actual);
    matched = expected.some((item) =>
      (condition.caseSensitive ?? false) ? value === item : value.toLocaleLowerCase() === item.toLocaleLowerCase(),
    );
  } else {
    matched = expected.some((item) => compareText(normalize(actual), item, condition));
  }

  return condition.negate ? !matched : matched;
};

export const matchesRule = (notification: IncomingNotification, rule: NotificationRule, now = new Date()): boolean => {
  if (!rule.enabled || !scheduleMatches(rule.schedule, now)) return false;
  if (rule.conditions.length === 0) return true;

  const results = rule.conditions.map((condition) => matchesCondition(notification, condition));

  return rule.match === "all" ? results.every(Boolean) : results.some(Boolean);
};

export const evaluateNotification = (
  input: IncomingNotification,
  preferences: NotificationPreferences,
): NotificationEvaluation => {
  const notification: IncomingNotification = {
    ...input,
    tags: [...(input.tags ?? [])],
  };

  let disposition: NotificationEvaluation["disposition"] = "send";
  let channelIds = [...preferences.defaultChannelIds];
  const matchedRuleIds: string[] = [];
  const reasons: string[] = [];

  const rules = [...preferences.rules].toSorted((left, right) => right.priority - left.priority);

  for (const rule of rules) {
    if (!matchesRule(notification, rule)) continue;

    matchedRuleIds.push(rule.id);
    reasons.push("Matched rule: " + rule.name);

    for (const action of rule.actions) {
      switch (action.type) {
        case "send":
          disposition = "send";
          if (action.channels) channelIds = [...action.channels];
          break;
        case "ignore":
          disposition = "ignored";
          channelIds = [];
          break;
        case "archive":
          disposition = "archived";
          channelIds = [];
          break;
        case "setSeverity":
          notification.severity = action.severity;
          break;
        case "addTag":
          notification.tags = Array.from(new Set([...(notification.tags ?? []), action.tag]));
          break;
        case "setCategory":
          notification.category = action.category;
          break;
      }
    }

    if (rule.stopProcessing) break;
  }

  return {
    notification,
    disposition,
    channelIds,
    matchedRuleIds,
    reasons,
  };
};
