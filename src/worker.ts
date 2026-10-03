import "dotenv/config";
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { processAutoAssign, processSendEmail, processSlaCheck, processWebhookDelivery } from "@/lib/queue/processors";

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker(
    "ticketing",
    async (job) => {
      switch (job.name) {
        case "auto-assign": {
          const ticketId = (job.data as { ticketId?: string }).ticketId;
          if (!ticketId) throw new Error("auto-assign job is missing ticketId");
          return processAutoAssign(ticketId);
        }
      case "sla-check":
        return processSlaCheck();
      case "send-email": {
        const emailId = (job.data as { emailId?: string }).emailId;
        if (!emailId) throw new Error("send-email job is missing emailId");
        return processSendEmail(emailId);
      }
      case "webhook-delivery": {
        const deliveryId = (job.data as { deliveryId?: string }).deliveryId;
        if (!deliveryId) throw new Error("webhook-delivery job is missing deliveryId");
        return processWebhookDelivery(deliveryId);
      }
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("completed", (job, result) => {
    console.log(`[worker] ${job.name} ${job.id} completed`, result ?? "");
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] ${job?.name} ${job?.id} failed:`, error.message);
  });

  // The deadline watchdog. Upserting with a stable scheduler id makes restarts
  // safe — the schedule is created once and left alone afterwards.
  const scheduler = new Queue("ticketing", { connection: connection.duplicate() });
  await scheduler.upsertJobScheduler(
    "sla-check-every-minute",
    { every: 60_000 },
    {
      name: "sla-check",
      data: {},
      opts: { removeOnComplete: 10, removeOnFail: 50 },
    },
  );
  await scheduler.close();

  console.log("[worker] started — waiting for jobs (Ctrl+C to stop)");

  const shutdown = (signal: string) => {
    console.log(`[worker] ${signal} — shutting down`);
    void worker.close().then(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error) => {
  console.error("[worker] failed to start:", error);
  process.exit(1);
});
