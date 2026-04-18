import { Job } from "bullmq";
import { createQueue, createWorker } from "../../common/services/mq.service.js";
import { prisma } from "../../config/prisma.js";

export const notificationQueue = createQueue("notification_queue");

interface NotificationJobData {
  title: string;
  message: string;
}

createWorker("notification_queue", async (job: Job<NotificationJobData>) => {
  const { title, message } = job.data;
  await prisma.notification.create({
    data: {
      title,
      message,
    },
  });
});

export const notificationService = {
  async addNotification(title: string, message: string) {
    await notificationQueue.add("notification", { title, message });
  },
};
