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
 * Shared connection for enqueuing from Server Actions / Route Handlers.
 * The worker process creates its own connections in `src/worker.ts`.
 */
export const queueConnection = createConnection();

export const ticketQueue = new Queue("ticketing", { connection: queueConnection });

export async function enqueueAutoAssign(ticketId: string): Promise<void> {
  // No custom jobId: BullMQ deduplicates against completed jobs too, which
  // would silently swallow re-enqueues (e.g. after an escalation unassigns
  // the ticket). The processor is idempotent — already-assigned tickets are
  // skipped — so duplicate deliveries are harmless.
  await ticketQueue.add(
    "auto-assign",
    { ticketId },
    { removeOnComplete: 100, removeOnFail: 500 },
  );
}

export async function enqueueEmail(emailId: string): Promise<void> {
  await ticketQueue.add(
    "send-email",
    { emailId },
    { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: 200, removeOnFail: 500 },
  );
}

export async function enqueueWebhookDelivery(deliveryId: string): Promise<void> {
  await ticketQueue.add(
    "webhook-delivery",
    { deliveryId },
    { attempts: 5, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: 200, removeOnFail: 500 },
  );
}
