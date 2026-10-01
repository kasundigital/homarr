import type { IncomingNotification, TelegramNotificationSettings } from "./types";

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const renderTelegramTemplate = (
  template: string,
  notification: IncomingNotification,
): string => {
  const values: Record<string, string> = {
    source: notification.source,
    sender: notification.sender ?? "",
    title: notification.title ?? "",
    message: notification.message,
    severity: notification.severity ?? "info",
    category: notification.category ?? "",
    account: notification.account ?? "",
    receivedAt: notification.receivedAt ?? new Date().toISOString(),
  };

  return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_match, key: string) => {
    return escapeHtml(values[key] ?? "");
  });
};

export const sendTelegramNotification = async (
  settings: TelegramNotificationSettings,
  notification: IncomingNotification,
): Promise<void> => {
  if (!settings.enabled) {
    throw new Error("Telegram notifications are disabled");
  }
  if (!settings.botToken.trim() || !settings.chatId.trim()) {
    throw new Error("Telegram bot token and chat ID are required");
  }

  const body: Record<string, unknown> = {
    chat_id: settings.chatId.trim(),
    text: renderTelegramTemplate(settings.messageTemplate, notification),
    disable_web_page_preview: settings.disableWebPagePreview,
  };

  if (settings.parseMode !== "None") body.parse_mode = settings.parseMode;
  if (settings.topicId.trim()) body.message_thread_id = Number(settings.topicId.trim());

  const response = await fetch(
    `https://api.telegram.org/bot${settings.botToken.trim()}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Telegram API error ${response.status}: ${detail.slice(0, 300)}`);
  }
};
