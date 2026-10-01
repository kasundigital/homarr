import { z } from "zod/v4";

import { sendTelegramNotification, type HomeHubNotificationSettings } from "@homehub/notification-engine";

import { createTRPCRouter, permissionRequiredProcedure } from "../trpc";
import {
  getHomeHubNotificationHistoryAsync,
  getHomeHubNotificationSettingsAsync,
  saveHomeHubNotificationHistoryAsync,
  saveHomeHubNotificationSettingsAsync,
} from "../services/homehub-notifications";

const conditionSchema = z.object({
  field: z.enum(["source", "sender", "title", "message", "severity", "category", "account", "tags"]),
  operator: z.enum(["equals", "contains", "startsWith", "endsWith", "regex", "in"]),
  value: z.union([z.string(), z.array(z.string())]),
  caseSensitive: z.boolean().optional(),
  negate: z.boolean().optional(),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("send"), channels: z.array(z.string()).optional() }),
  z.object({ type: z.literal("ignore") }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("setSeverity"), severity: z.enum(["info", "success", "warning", "critical"]) }),
  z.object({ type: z.literal("addTag"), tag: z.string() }),
  z.object({ type: z.literal("setCategory"), category: z.string() }),
]);

const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  priority: z.number().int(),
  stopProcessing: z.boolean().optional(),
  match: z.enum(["all", "any"]),
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema),
  schedule: z
    .object({
      timezone: z.string().optional(),
      days: z.array(z.number().int().min(0).max(6)).optional(),
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

const settingsSchema = z.object({
  enabled: z.boolean(),
  ingestToken: z.string(),
  keepIgnoredInHistory: z.boolean(),
  historyLimit: z.number().int().min(10).max(1000),
  defaultChannelIds: z.array(z.string()),
  ignoredSenders: z.array(z.string()),
  ignoredKeywords: z.array(z.string()),
  rules: z.array(ruleSchema),
  telegram: z.object({
    enabled: z.boolean(),
    botToken: z.string(),
    chatId: z.string(),
    topicId: z.string(),
    parseMode: z.enum(["HTML", "MarkdownV2", "None"]),
    disableWebPagePreview: z.boolean(),
    messageTemplate: z.string().min(1),
  }),
});

export const homehubNotificationsRouter = createTRPCRouter({
  getSettings: permissionRequiredProcedure.requiresPermission("admin").query(async ({ ctx }) => {
    const settings = await getHomeHubNotificationSettingsAsync(ctx.db);
    return {
      ...settings,
      telegram: {
        ...settings.telegram,
        botToken: "",
      },
      botTokenConfigured: settings.telegram.botToken.length > 0,
    };
  }),

  saveSettings: permissionRequiredProcedure
    .requiresPermission("admin")
    .input(settingsSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await getHomeHubNotificationSettingsAsync(ctx.db);
      const next: HomeHubNotificationSettings = {
        ...input,
        telegram: {
          ...input.telegram,
          botToken: input.telegram.botToken.trim() || current.telegram.botToken,
        },
        ignoredSenders: input.ignoredSenders.map((value) => value.trim()).filter(Boolean),
        ignoredKeywords: input.ignoredKeywords.map((value) => value.trim()).filter(Boolean),
      };
      await saveHomeHubNotificationSettingsAsync(ctx.db, next);
      return { success: true };
    }),

  testTelegram: permissionRequiredProcedure
    .requiresPermission("admin")
    .mutation(async ({ ctx }) => {
      const settings = await getHomeHubNotificationSettingsAsync(ctx.db);
      await sendTelegramNotification(settings.telegram, {
        source: "HomeHub",
        title: "Telegram test successful",
        message: "Your HomeHub Telegram notification channel is working.",
        severity: "success",
        category: "system",
        receivedAt: new Date().toISOString(),
      });
      return { success: true };
    }),

  getHistory: permissionRequiredProcedure.requiresPermission("admin").query(async ({ ctx }) => {
    return await getHomeHubNotificationHistoryAsync(ctx.db);
  }),

  clearHistory: permissionRequiredProcedure
    .requiresPermission("admin")
    .mutation(async ({ ctx }) => {
      await saveHomeHubNotificationHistoryAsync(ctx.db, []);
      return { success: true };
    }),

  markAllRead: permissionRequiredProcedure
    .requiresPermission("admin")
    .mutation(async ({ ctx }) => {
      const history = await getHomeHubNotificationHistoryAsync(ctx.db);
      await saveHomeHubNotificationHistoryAsync(
        ctx.db,
        history.map((item) => ({ ...item, read: true })),
      );
      return { success: true };
    }),
});
