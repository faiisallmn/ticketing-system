import { Queue } from "bullmq";
import IORedis from "ioredis";

function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

function createConnection(): IORedis {
  return new IORedis(redisUrl(), {
    // BullMQ requires command timeouts to be disabled so long-polling works.
    maxRetriesPerRequest: null,
  });
}

/**
 * Shared queue for enqueuing from Server Actions / Route Handlers, created on
 * first use so that importing this module (e.g. during `next build`) doesn't
 * open a Redis connection. The worker process creates its own connections in
 * `src/worker.ts`.
 */
const globalForQueue = globalThis as unknown as { ticketQueue?: Queue };

function getTicketQueue(): Queue {
  if (!globalForQueue.ticketQueue) {
    globalForQueue.ticketQueue = new Queue("ticketing", { connection: createConnection() });
  }
  return globalForQueue.ticketQueue;
}

export async function enqueueAutoAssign(ticketId: string): Promise<void> {
  // No custom jobId: BullMQ deduplicates against completed jobs too, which
  // would silently swallow re-enqueues (e.g. after an escalation unassigns
  // the ticket). The processor is idempotent — already-assigned tickets are
  // skipped — so duplicate deliveries are harmless.
  await getTicketQueue().add(
    "auto-assign",
    { ticketId },
    { removeOnComplete: 100, removeOnFail: 500 },
  );
}

export async function enqueueEmail(emailId: string): Promise<void> {
  await getTicketQueue().add(
    "send-email",
    { emailId },
    { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: 200, removeOnFail: 500 },
  );
}

export async function enqueueWebhookDelivery(deliveryId: string): Promise<void> {
  await getTicketQueue().add(
    "webhook-delivery",
    { deliveryId },
    { attempts: 5, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: 200, removeOnFail: 500 },
  );
}
