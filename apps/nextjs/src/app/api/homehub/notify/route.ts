import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import {
  getHomeHubNotificationSettingsAsync,
  processHomeHubNotificationAsync,
} from "@homarr/api/homehub-notifications";
import { db } from "@homarr/db";

const notificationSchema = z.object({
  source: z.string().min(1).max(100),
  sender: z.string().max(200).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  message: z.string().min(1).max(10000),
  severity: z.enum(["info", "success", "warning", "critical"]).optional(),
  category: z.string().max(100).nullable().optional(),
  account: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  receivedAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const tokenMatches = (expected: string, actual: string): boolean => {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const POST = async (request: Request) => {
  const settings = await getHomeHubNotificationSettingsAsync(db);

  if (!settings.ingestToken) {
    return NextResponse.json({ error: "Notification ingestion is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerToken = request.headers.get("x-homehub-token")?.trim() ?? "";
  const suppliedToken = bearer || headerToken;

  if (!tokenMatches(settings.ingestToken, suppliedToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = notificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid notification payload", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await processHomeHubNotificationAsync(db, parsed.data);

  return NextResponse.json({
    id: result.id,
    disposition: result.disposition,
    matchedRuleIds: result.matchedRuleIds,
    reasons: result.reasons,
    deliveredAt: result.deliveredAt,
    error: result.error,
  });
};

export const GET = async () => {
  return NextResponse.json({
    service: "HomeHub Notifications",
    status: "ok",
    endpoint: "/api/homehub/notify",
  });
};
