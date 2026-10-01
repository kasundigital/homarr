"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Divider,
  Group,
  NumberInput,
  PasswordInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconBell,
  IconCheck,
  IconCopy,
  IconRefresh,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";

import { clientApi } from "@homarr/api/client";
import { showErrorNotification, showSuccessNotification } from "@homarr/notifications";

type FormState = {
  enabled: boolean;
  ingestToken: string;
  keepIgnoredInHistory: boolean;
  historyLimit: number;
  defaultChannelIds: string[];
  ignoredSendersText: string;
  ignoredKeywordsText: string;
  rulesText: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramTopicId: string;
  telegramParseMode: "HTML" | "MarkdownV2" | "None";
  telegramDisableWebPagePreview: boolean;
  telegramMessageTemplate: string;
};

const emptyForm: FormState = {
  enabled: true,
  ingestToken: "",
  keepIgnoredInHistory: true,
  historyLimit: 200,
  defaultChannelIds: ["telegram"],
  ignoredSendersText: "",
  ignoredKeywordsText: "",
  rulesText: "[]",
  telegramEnabled: false,
  telegramBotToken: "",
  telegramChatId: "",
  telegramTopicId: "",
  telegramParseMode: "HTML",
  telegramDisableWebPagePreview: true,
  telegramMessageTemplate:
    "<b>{{severity}}</b> • {{source}}\n<b>{{title}}</b>\n{{message}}\n{{sender}}",
};

const splitLines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const generateToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

export const HomeHubNotificationsManager = () => {
  const settingsQuery = clientApi.homehubNotifications.getSettings.useQuery();
  const historyQuery = clientApi.homehubNotifications.getHistory.useQuery();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data || loaded) return;
    const data = settingsQuery.data;
    setForm({
      enabled: data.enabled,
      ingestToken: data.ingestToken,
      keepIgnoredInHistory: data.keepIgnoredInHistory,
      historyLimit: data.historyLimit,
      defaultChannelIds: data.defaultChannelIds,
      ignoredSendersText: data.ignoredSenders.join("\n"),
      ignoredKeywordsText: data.ignoredKeywords.join("\n"),
      rulesText: JSON.stringify(data.rules, null, 2),
      telegramEnabled: data.telegram.enabled,
      telegramBotToken: "",
      telegramChatId: data.telegram.chatId,
      telegramTopicId: data.telegram.topicId,
      telegramParseMode: data.telegram.parseMode,
      telegramDisableWebPagePreview: data.telegram.disableWebPagePreview,
      telegramMessageTemplate: data.telegram.messageTemplate,
    });
    setLoaded(true);
  }, [settingsQuery.data, loaded]);

  const saveMutation = clientApi.homehubNotifications.saveSettings.useMutation({
    onSuccess: async () => {
      showSuccessNotification({
        title: "Notifications saved",
        message: "HomeHub notification settings were updated.",
      });
      setForm((current) => ({ ...current, telegramBotToken: "" }));
      await settingsQuery.refetch();
    },
    onError: (error) => {
      showErrorNotification({ title: "Unable to save", message: error.message });
    },
  });

  const testMutation = clientApi.homehubNotifications.testTelegram.useMutation({
    onSuccess: () => {
      showSuccessNotification({
        title: "Telegram test sent",
        message: "Check your Telegram chat for the HomeHub test message.",
      });
    },
    onError: (error) => {
      showErrorNotification({ title: "Telegram test failed", message: error.message });
    },
  });

  const clearMutation = clientApi.homehubNotifications.clearHistory.useMutation({
    onSuccess: async () => {
      await historyQuery.refetch();
      showSuccessNotification({ title: "History cleared", message: "Notification history is empty." });
    },
    onError: (error) => {
      showErrorNotification({ title: "Unable to clear history", message: error.message });
    },
  });

  const markReadMutation = clientApi.homehubNotifications.markAllRead.useMutation({
    onSuccess: async () => {
      await historyQuery.refetch();
    },
    onError: (error) => {
      showErrorNotification({ title: "Unable to update history", message: error.message });
    },
  });

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "/api/homehub/notify";
    return window.location.origin + "/api/homehub/notify";
  }, []);

  const save = () => {
    let rules: unknown;
    try {
      rules = JSON.parse(form.rulesText);
      if (!Array.isArray(rules)) throw new Error("Rules JSON must be an array.");
    } catch (error) {
      showErrorNotification({
        title: "Invalid rules JSON",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    saveMutation.mutate({
      enabled: form.enabled,
      ingestToken: form.ingestToken.trim(),
      keepIgnoredInHistory: form.keepIgnoredInHistory,
      historyLimit: form.historyLimit,
      defaultChannelIds: form.defaultChannelIds,
      ignoredSenders: splitLines(form.ignoredSendersText),
      ignoredKeywords: splitLines(form.ignoredKeywordsText),
      rules: rules as never[],
      telegram: {
        enabled: form.telegramEnabled,
        botToken: form.telegramBotToken,
        chatId: form.telegramChatId.trim(),
        topicId: form.telegramTopicId.trim(),
        parseMode: form.telegramParseMode,
        disableWebPagePreview: form.telegramDisableWebPagePreview,
        messageTemplate: form.telegramMessageTemplate,
      },
    });
  };

  if (settingsQuery.isLoading) {
    return <Text c="dimmed">Loading notification settings…</Text>;
  }

  if (settingsQuery.error) {
    return (
      <Alert color="red" title="Unable to load settings">
        {settingsQuery.error.message}
      </Alert>
    );
  }

  const botConfigured = settingsQuery.data?.botTokenConfigured ?? false;
  const history = historyQuery.data ?? [];

  return (
    <Tabs defaultValue="settings">
      <Tabs.List>
        <Tabs.Tab value="settings" leftSection={<IconBell size={16} />}>
          Settings
        </Tabs.Tab>
        <Tabs.Tab value="filters">Ignore & Rules</Tabs.Tab>
        <Tabs.Tab value="history">History ({history.length})</Tabs.Tab>
        <Tabs.Tab value="api">API / n8n</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="settings" pt="md">
        <Stack gap="md">
          <Card withBorder>
            <Stack>
              <Group justify="space-between">
                <div>
                  <Title order={3}>Notification engine</Title>
                  <Text size="sm" c="dimmed">
                    Master controls for HomeHub alert processing.
                  </Text>
                </div>
                <Switch
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.currentTarget.checked })}
                  label="Enabled"
                />
              </Group>

              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <NumberInput
                  label="History limit"
                  description="10–1000 notifications"
                  min={10}
                  max={1000}
                  value={form.historyLimit}
                  onChange={(value) => setForm({ ...form, historyLimit: Number(value) || 200 })}
                />
                <Switch
                  checked={form.keepIgnoredInHistory}
                  onChange={(event) =>
                    setForm({ ...form, keepIgnoredInHistory: event.currentTarget.checked })
                  }
                  label="Keep ignored notifications in history"
                />
              </SimpleGrid>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack>
              <Group justify="space-between">
                <div>
                  <Title order={3}>Telegram</Title>
                  <Text size="sm" c="dimmed">
                    Primary push channel. The bot token is not returned to the browser after saving.
                  </Text>
                </div>
                <Badge color={botConfigured ? "green" : "gray"}>
                  {botConfigured ? "Token configured" : "Token not configured"}
                </Badge>
              </Group>

              <Switch
                checked={form.telegramEnabled}
                onChange={(event) =>
                  setForm({ ...form, telegramEnabled: event.currentTarget.checked })
                }
                label="Enable Telegram delivery"
              />

              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <PasswordInput
                  label="Bot token"
                  description={
                    botConfigured
                      ? "Leave blank to keep the existing token."
                      : "Paste the token created with BotFather."
                  }
                  value={form.telegramBotToken}
                  onChange={(event) =>
                    setForm({ ...form, telegramBotToken: event.currentTarget.value })
                  }
                  placeholder={botConfigured ? "Configured — enter only to replace" : "123456:ABC..."}
                />

                <TextInput
                  label="Chat ID"
                  value={form.telegramChatId}
                  onChange={(event) => setForm({ ...form, telegramChatId: event.currentTarget.value })}
                  placeholder="123456789 or -100..."
                />

                <TextInput
                  label="Topic / thread ID"
                  description="Optional for Telegram forum topics."
                  value={form.telegramTopicId}
                  onChange={(event) =>
                    setForm({ ...form, telegramTopicId: event.currentTarget.value })
                  }
                />

                <Select
                  label="Parse mode"
                  data={["HTML", "MarkdownV2", "None"]}
                  value={form.telegramParseMode}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      telegramParseMode: (value ?? "HTML") as FormState["telegramParseMode"],
                    })
                  }
                />
              </SimpleGrid>

              <Textarea
                label="Telegram message template"
                description="Variables: {{severity}}, {{source}}, {{title}}, {{message}}, {{sender}}, {{category}}, {{account}}, {{receivedAt}}"
                autosize
                minRows={4}
                value={form.telegramMessageTemplate}
                onChange={(event) =>
                  setForm({ ...form, telegramMessageTemplate: event.currentTarget.value })
                }
              />

              <Switch
                checked={form.telegramDisableWebPagePreview}
                onChange={(event) =>
                  setForm({
                    ...form,
                    telegramDisableWebPagePreview: event.currentTarget.checked,
                  })
                }
                label="Disable web page previews"
              />

              <Group>
                <Button
                  leftSection={<IconSend size={16} />}
                  variant="light"
                  loading={testMutation.isPending}
                  disabled={!botConfigured && !form.telegramBotToken}
                  onClick={() => {
                    if (form.telegramBotToken) {
                      showErrorNotification({
                        title: "Save token first",
                        message: "Save your Telegram settings before sending the test message.",
                      });
                      return;
                    }
                    testMutation.mutate();
                  }}
                >
                  Test Telegram
                </Button>
              </Group>
            </Stack>
          </Card>

          <Group justify="flex-end">
            <Button loading={saveMutation.isPending} onClick={save}>
              Save notification settings
            </Button>
          </Group>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="filters" pt="md">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder>
              <Stack>
                <Title order={3}>Ignored senders / numbers</Title>
                <Text size="sm" c="dimmed">
                  One sender, sender ID, or phone number per line. Matching is case-insensitive and
                  uses contains.
                </Text>
                <Textarea
                  autosize
                  minRows={10}
                  placeholder={"+9477...\nDialogPromo\nSAMPATHTXN"}
                  value={form.ignoredSendersText}
                  onChange={(event) =>
                    setForm({ ...form, ignoredSendersText: event.currentTarget.value })
                  }
                />
              </Stack>
            </Card>

            <Card withBorder>
              <Stack>
                <Title order={3}>Ignored words / messages</Title>
                <Text size="sm" c="dimmed">
                  One keyword or phrase per line. HomeHub checks both title and message.
                </Text>
                <Textarea
                  autosize
                  minRows={10}
                  placeholder={"promotion\nspecial offer\nOTP"}
                  value={form.ignoredKeywordsText}
                  onChange={(event) =>
                    setForm({ ...form, ignoredKeywordsText: event.currentTarget.value })
                  }
                />
              </Stack>
            </Card>
          </SimpleGrid>

          <Card withBorder>
            <Stack>
              <Title order={3}>Advanced rules</Title>
              <Text size="sm" c="dimmed">
                Full JSON rule editor for sender, message, source, category, severity, account and
                tag matching. Rules support equals, contains, startsWith, endsWith, regex and in,
                plus send, ignore, archive, setSeverity, addTag and setCategory actions.
              </Text>
              <Textarea
                styles={{ input: { fontFamily: "monospace" } }}
                autosize
                minRows={14}
                value={form.rulesText}
                onChange={(event) => setForm({ ...form, rulesText: event.currentTarget.value })}
              />
            </Stack>
          </Card>

          <Group justify="flex-end">
            <Button loading={saveMutation.isPending} onClick={save}>
              Save filters & rules
            </Button>
          </Group>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="history" pt="md">
        <Stack>
          <Group justify="space-between">
            <div>
              <Title order={3}>Notification history</Title>
              <Text size="sm" c="dimmed">
                See what was sent, ignored, archived, or failed and why.
              </Text>
            </div>
            <Group>
              <Tooltip label="Refresh">
                <ActionIcon variant="default" onClick={() => void historyQuery.refetch()}>
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
              <Button variant="default" onClick={() => markReadMutation.mutate()}>
                Mark all read
              </Button>
              <Button
                color="red"
                variant="light"
                leftSection={<IconTrash size={16} />}
                onClick={() => clearMutation.mutate()}
              >
                Clear
              </Button>
            </Group>
          </Group>

          <ScrollArea>
            <Table striped highlightOnHover miw={900}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Sender</Table.Th>
                  <Table.Th>Message</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Reason</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((item) => (
                  <Table.Tr key={item.id} fw={item.read ? undefined : 600}>
                    <Table.Td>{new Date(item.createdAt).toLocaleString()}</Table.Td>
                    <Table.Td>{item.notification.source}</Table.Td>
                    <Table.Td>{item.notification.sender || "—"}</Table.Td>
                    <Table.Td maw={400}>
                      <Text lineClamp={2}>
                        {(item.notification.title ? item.notification.title + ": " : "") +
                          item.notification.message}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={
                          item.disposition === "send"
                            ? "green"
                            : item.disposition === "failed"
                              ? "red"
                              : item.disposition === "ignored"
                                ? "gray"
                                : "blue"
                        }
                      >
                        {item.disposition}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{item.error ?? (item.reasons.join(", ") || "—")}</Table.Td>
                  </Table.Tr>
                ))}
                {history.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text ta="center" c="dimmed">
                        No notifications yet.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="api" pt="md">
        <Stack>
          <Card withBorder>
            <Stack>
              <Title order={3}>Incoming webhook</Title>
              <Text size="sm" c="dimmed">
                Send alerts from n8n, StackPulse, Home Assistant, scripts, or any HTTP client.
              </Text>

              <TextInput
                label="Webhook URL"
                value={webhookUrl}
                readOnly
                rightSection={
                  <CopyButton value={webhookUrl}>
                    {({ copied, copy }) => (
                      <ActionIcon variant="subtle" onClick={copy}>
                        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                      </ActionIcon>
                    )}
                  </CopyButton>
                }
              />

              <PasswordInput
                label="Ingest token"
                value={form.ingestToken}
                onChange={(event) => setForm({ ...form, ingestToken: event.currentTarget.value })}
                rightSectionWidth={110}
                rightSection={
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setForm({ ...form, ingestToken: generateToken() })}
                  >
                    Generate
                  </Button>
                }
              />

              <Alert title="Authentication">
                Use <Code>Authorization: Bearer YOUR_TOKEN</Code> or{" "}
                <Code>x-homehub-token: YOUR_TOKEN</Code>.
              </Alert>

              <Divider />

              <Text fw={600}>Example payload</Text>
              <Code block>
                {'{\n  "source": "n8n",\n  "sender": "CEB",\n  "title": "Electricity bill received",\n  "message": "Rs 8,420 due on 2026-10-06",\n  "severity": "warning",\n  "category": "bills",\n  "tags": ["electricity", "bill"]\n}'}
              </Code>
            </Stack>
          </Card>

          <Group justify="flex-end">
            <Button loading={saveMutation.isPending} onClick={save}>
              Save API settings
            </Button>
          </Group>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
};
