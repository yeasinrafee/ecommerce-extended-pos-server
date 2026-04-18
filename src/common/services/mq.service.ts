import { Queue, Worker, Job, QueueEvents } from "bullmq";
import * as Redis from "ioredis";
import { env } from "../../config/env.js";

const connectionOptions = {
  host: env.redisHost,
  port: env.redisPort,
  password: env.redisPassword,
  db: env.redisDb,
  maxRetriesPerRequest: null,
};

const verifyRedisConnection = async (queueName: string) => {
  try {
    const client = new (Redis as any)(connectionOptions as any);
    await client.ping();
    client.disconnect();
    console.log(`[MQ] Redis reachable for ${queueName} — ${connectionOptions.host}:${connectionOptions.port}`);
    return true;
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MQ] Redis connection failed for ${queueName}: ${msg}`);
    return false;
  }
};

export const createQueue = (queueName: string, opts?: { verify?: boolean }) => {
  if (opts?.verify) void verifyRedisConnection(queueName);

  const queue = new Queue(queueName, {
    connection: connectionOptions as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    },
  });

  console.log(`[MQ] Queue created: ${queueName} — ${connectionOptions.host}:${connectionOptions.port}`);
  return queue;
};

export const createWorker = (
  queueName: string,
  processor: (job: Job) => Promise<any>,
  concurrency: number = 5,
  opts?: { verify?: boolean },
) => {
  if (opts?.verify) void verifyRedisConnection(queueName);

  const worker = new Worker(queueName, processor, {
    connection: connectionOptions as any,
    concurrency,
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed with error: ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`Worker error: ${err.message}`);
  });

  console.log(`[MQ] Worker created: ${queueName} — ${connectionOptions.host}:${connectionOptions.port}`);
  return worker;
};

export const createQueueEvents = (queueName: string, opts?: { verify?: boolean }) => {
  if (opts?.verify) void verifyRedisConnection(queueName);
  const events = new QueueEvents(queueName, { connection: connectionOptions as any });
  console.log(`[MQ] QueueEvents created: ${queueName} — ${connectionOptions.host}:${connectionOptions.port}`);
  return events;
};
