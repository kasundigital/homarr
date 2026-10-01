export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type NotificationChannelKind =
  | "telegram"
  | "dashboard"
  | "email"
  | "webhook"
  | "ntfy"
  | "gotify";

export type NotificationMatchOperator =
  | "equals"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "regex"
  | "in";

export type NotificationMatchField =
  | "source"
  | "sender"
  | "title"
  | "message"
  | "severity"
  | "category"
  | "account"
  | "tags";

export interface IncomingNotification {
  id?: string;
  source: string;
  sender?: string | null;
  title?: string | null;
  message: string;
  severity?: NotificationSeverity;
  category?: string | null;
  account?: string | null;
  tags?: string[];
  receivedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationCondition {
  field: NotificationMatchField;
  operator: NotificationMatchOperator;
  value: string | string[];
  caseSensitive?: boolean;
  negate?: boolean;
}

export type NotificationRuleAction =
  | { type: "send"; channels?: string[] }
  | { type: "ignore" }
  | { type: "archive" }
  | { type: "setSeverity"; severity: NotificationSeverity }
  | { type: "addTag"; tag: string }
  | { type: "setCategory"; category: string };

export interface NotificationRuleSchedule {
  timezone?: string;
  days?: number[];
  start?: string;
  end?: string;
}

export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  stopProcessing?: boolean;
  match: "all" | "any";
  conditions: NotificationCondition[];
  actions: NotificationRuleAction[];
  schedule?: NotificationRuleSchedule;
}

export interface NotificationChannel {
  id: string;
  name: string;
  kind: NotificationChannelKind;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export type NotificationDisposition = "send" | "ignored" | "archived";

export interface NotificationEvaluation {
  notification: IncomingNotification;
  disposition: NotificationDisposition;
  channelIds: string[];
  matchedRuleIds: string[];
  reasons: string[];
}

export interface NotificationPreferences {
  defaultChannelIds: string[];
  keepIgnoredInHistory: boolean;
  rules: NotificationRule[];
}

export interface TelegramNotificationSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  topicId: string;
  parseMode: "HTML" | "MarkdownV2" | "None";
  disableWebPagePreview: boolean;
  messageTemplate: string;
}

export interface HomeHubNotificationSettings {
  enabled: boolean;
  ingestToken: string;
  keepIgnoredInHistory: boolean;
  historyLimit: number;
  defaultChannelIds: string[];
  ignoredSenders: string[];
  ignoredKeywords: string[];
  rules: NotificationRule[];
  telegram: TelegramNotificationSettings;
}

export interface NotificationHistoryItem {
  id: string;
  notification: IncomingNotification;
  disposition: NotificationDisposition | "failed";
  channelIds: string[];
  matchedRuleIds: string[];
  reasons: string[];
  createdAt: string;
  deliveredAt?: string | null;
  error?: string | null;
  read: boolean;
}
