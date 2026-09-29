import { PgBoss } from "pg-boss";

export const queueNames = {
  processCommerceEvent: "commerce-events.process",
  startFlow: "email-flows.start",
  executeStep: "email-flows.execute-step",
  dispatchScheduledCampaigns: "email-campaigns.dispatch-scheduled",
  sendCampaign: "email-campaigns.send",
  sendCampaignRecipient: "email-campaigns.send-recipient",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export interface StartFlowJob {
  flowId: string;
  email: string;
  context: Record<string, unknown>;
  messageKind: "marketing" | "transactional";
  sourceEventId?: string;
}

export interface ExecuteStepJob {
  flowRunId: string;
  stepPath: string;
  /** Accepted only for jobs queued by the pre-snapshot worker during rollout. */
  stepIndex?: number;
  branchSteps?: unknown[];
  branchIndex?: number;
}

export interface SendCampaignRecipientJob {
  campaignId: string;
  recipientId: string;
}

let boss: PgBoss | undefined;
let bossStartPromise: Promise<PgBoss> | undefined;

export async function getBoss(
  connectionString = process.env.DATABASE_URL,
): Promise<PgBoss> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for pg-boss");
  }

  if (!boss) {
    boss = new PgBoss({ connectionString });
    bossStartPromise = boss.start().then(async (startedBoss) => {
      await Promise.all(
        Object.values(queueNames).map((queueName) =>
          startedBoss.createQueue(queueName),
        ),
      );
      return startedBoss;
    });
  }

  return bossStartPromise ?? boss;
}

export async function sendJob(
  queueName: QueueName,
  data: Record<string, unknown>,
  options: Record<string, unknown> = {},
): Promise<string | undefined> {
  const bossInstance = await getBoss();
  return (await (
    bossInstance as unknown as {
      send: (name: string, data: unknown, options?: unknown) => Promise<string>;
    }
  ).send(queueName, data, options)) as string | undefined;
}

export async function stopBoss(): Promise<void> {
  if (!boss) {
    return;
  }

  await boss.stop();
  boss = undefined;
  bossStartPromise = undefined;
}
