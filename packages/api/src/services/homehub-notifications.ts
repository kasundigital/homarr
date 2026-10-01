import SuperJSON from "superjson";

import {
  evaluateNotification,
  sendTelegramNotification,
  type HomeHubNotificationSettings,
  type IncomingNotification,
  type NotificationHistoryItem,
  type NotificationRule,
} from "../homehub-notification-engine";
import type { Database } from "@homarr/db";
import { eq } from "@homarr/db";
import { serverSettings } from "@homarr/db/schema";

export const HOMEHUB_NOTIFICATION_SETTINGS_KEY = "homehub.notifications";
export const HOMEHUB_NOTIFICATION_HISTORY_KEY = "homehub.notificationHistory";

export const defaultHomeHubNotificationSettings: HomeHubNotificationSettings = {
  enabled: true,
  ingestToken: "",
  keepIgnoredInHistory: true,
  historyLimit: 200,
  defaultChannelIds: ["telegram"],
  ignoredSenders: [],
  ignoredKeywords: [],
  rules: [],
  telegram: {
    enabled: false,
    botToken: "",
    chatId: "",
    topicId: "",
    parseMode: "HTML",
    disableWebPagePreview: true,
    messageTemplate:
      "<b>{{severity}}</b> • {{source}}\n<b>{{title}}</b>\n{{message}}\n{{sender}}",
  },
};

const readRawSettingAsync = async <T>(db: Database, key: string, fallback: T): Promise<T> => {
  const row = await db.query.serverSettings.findFirst({
    where: eq(serverSettings.settingKey, key),
  });
  if (!row) return fallback;

  try {
    return SuperJSON.parse<T>(row.value);
  } catch {
    return fallback;
  }
};

const writeRawSettingAsync = async <T>(db: Database, key: string, value: T): Promise<void> => {
  const existing = await db.query.serverSettings.findFirst({
    where: eq(serverSettings.settingKey, key),
  });
  const serialized = SuperJSON.stringify(value);

  if (existing) {
    await db.update(serverSettings).set({ value: serialized }).where(eq(serverSettings.settingKey, key));
  } else {
    await db.insert(serverSettings).values({ settingKey: key, value: serialized });
  }
};

export const getHomeHubNotificationSettingsAsync = async (
  db: Database,
): Promise<HomeHubNotificationSettings> => {
  const value = await readRawSettingAsync<Partial<HomeHubNotificationSettings>>(
    db,
    HOMEHUB_NOTIFICATION_SETTINGS_KEY,
    {},
  );

  return {
    ...defaultHomeHubNotificationSettings,
    ...value,
    defaultChannelIds: value.defaultChannelIds ?? defaultHomeHubNotificationSettings.defaultChannelIds,
    ignoredSenders: value.ignoredSenders ?? [],
    ignoredKeywords: value.ignoredKeywords ?? [],
    rules: value.rules ?? [],
    telegram: {
      ...defaultHomeHubNotificationSettings.telegram,
      ...(value.telegram ?? {}),
    },
  };
};

export const saveHomeHubNotificationSettingsAsync = async (
  db: Database,
  settings: HomeHubNotificationSettings,
): Promise<void> => {
  await writeRawSettingAsync(db, HOMEHUB_NOTIFICATION_SETTINGS_KEY, settings);
};

export const getHomeHubNotificationHistoryAsync = async (
  db: Database,
): Promise<NotificationHistoryItem[]> => {
  return await readRawSettingAsync<NotificationHistoryItem[]>(db, HOMEHUB_NOTIFICATION_HISTORY_KEY, []);
};

export const saveHomeHubNotificationHistoryAsync = async (
  db: Database,
  history: NotificationHistoryItem[],
): Promise<void> => {
  await writeRawSettingAsync(db, HOMEHUB_NOTIFICATION_HISTORY_KEY, history);
};

const createBuiltInIgnoreRules = (settings: HomeHubNotificationSettings): NotificationRule[] => {
  const rules: NotificationRule[] = [];

  if (settings.ignoredSenders.length > 0) {
    rules.push({
      id: "builtin-ignore-senders",
      name: "Ignored senders",
      enabled: true,
      priority: 10000,
      stopProcessing: true,
      match: "any",
      conditions: settings.ignoredSenders.map((sender) => ({
        field: "sender",
        operator: "contains",
        value: sender,
        caseSensitive: false,
      })),
      actions: [{ type: "ignore" }],
    });
  }

  if (settings.ignoredKeywords.length > 0) {
    rules.push({
      id: "builtin-ignore-keywords",
      name: "Ignored keywords",
      enabled: true,
      priority: 9999,
      stopProcessing: true,
      match: "any",
      conditions: settings.ignoredKeywords.flatMap((keyword) => [
        {
          field: "message" as const,
          operator: "contains" as const,
          value: keyword,
          caseSensitive: false,
        },
        {
          field: "title" as const,
          operator: "contains" as const,
          value: keyword,
          caseSensitive: false,
        },
      ]),
      actions: [{ type: "ignore" }],
    });
  }

  return rules;
};

const makeHistoryId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const addHistoryAsync = async (
  db: Database,
  item: NotificationHistoryItem,
  settings: HomeHubNotificationSettings,
): Promise<void> => {
  if (item.disposition === "ignored" && !settings.keepIgnoredInHistory) return;

  const history = await getHomeHubNotificationHistoryAsync(db);
  const next = [item, ...history].slice(0, Math.max(10, Math.min(settings.historyLimit, 1000)));
  await saveHomeHubNotificationHistoryAsync(db, next);
};

export const processHomeHubNotificationAsync = async (
  db: Database,
  input: IncomingNotification,
): Promise<NotificationHistoryItem> => {
  const settings = await getHomeHubNotificationSettingsAsync(db);
  const notification: IncomingNotification = {
    ...input,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    severity: input.severity ?? "info",
  };

  if (!settings.enabled) {
    const disabledItem: NotificationHistoryItem = {
      id: makeHistoryId(),
      notification,
      disposition: "ignored",
      channelIds: [],
      matchedRuleIds: [],
      reasons: ["HomeHub notifications are disabled"],
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      error: null,
      read: false,
    };
    await addHistoryAsync(db, disabledItem, settings);
    return disabledItem;
  }

  const evaluation = evaluateNotification(notification, {
    defaultChannelIds: settings.defaultChannelIds,
    keepIgnoredInHistory: settings.keepIgnoredInHistory,
    rules: [...createBuiltInIgnoreRules(settings), ...settings.rules],
  });

  const item: NotificationHistoryItem = {
    id: makeHistoryId(),
    notification: evaluation.notification,
    disposition: evaluation.disposition,
    channelIds: evaluation.channelIds,
    matchedRuleIds: evaluation.matchedRuleIds,
    reasons: evaluation.reasons,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    error: null,
    read: false,
  };

  if (evaluation.disposition === "send" && evaluation.channelIds.includes("telegram")) {
    if (!settings.telegram.enabled) {
      item.disposition = "failed";
      item.error = "Telegram channel is selected but disabled";
    } else {
      try {
        await sendTelegramNotification(settings.telegram, evaluation.notification);
        item.deliveredAt = new Date().toISOString();
      } catch (error) {
        item.disposition = "failed";
        item.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  await addHistoryAsync(db, item, settings);
  return item;
};
