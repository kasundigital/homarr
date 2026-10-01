import { notFound } from "next/navigation";
import { Stack, Title, Text } from "@mantine/core";

import { auth } from "@homarr/auth/next";

import { DynamicBreadcrumb } from "~/components/navigation/dynamic-breadcrumb";
import { HomeHubNotificationsManager } from "./_components/homehub-notifications-manager";

export const metadata = {
  title: "Notifications • HomeHub",
};

export default async function HomeHubNotificationsPage() {
  const session = await auth();
  if (!session?.user.permissions.includes("admin")) notFound();

  return (
    <>
      <DynamicBreadcrumb />
      <Stack gap="lg">
        <div>
          <Title order={1}>Notifications</Title>
          <Text c="dimmed">
            Route HomeHub, n8n, server, bill, Home Assistant, and other alerts through configurable rules.
          </Text>
        </div>
        <HomeHubNotificationsManager />
      </Stack>
    </>
  );
}
