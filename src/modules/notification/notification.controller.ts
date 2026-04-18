import { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/app-error.js";

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");

    const admin = await prisma.admin.findUnique({
      where: { userId },
    });

    if (!admin) throw new AppError(404, "Admin not found");

    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        adminNotifications: {
          where: { adminId: admin.id },
        },
      },
    });

    const formattedNotifications = notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      createdAt: n.createdAt,
      seen: n.adminNotifications.length > 0 ? n.adminNotifications[0].seen : false,
    }));

    const unseenCount = formattedNotifications.filter((n) => !n.seen).length;

    res.status(200).json({
      success: true,
      data: formattedNotifications,
      unseenCount,
    });
  } catch (error) {
    next(error);
  }
};

export const markNotificationsSeen = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");

    const { notificationIds } = req.body;
    if (!notificationIds || !Array.isArray(notificationIds)) {
      throw new AppError(400, "notificationIds array is required");
    }

    const admin = await prisma.admin.findUnique({
      where: { userId },
    });

    if (!admin) throw new AppError(404, "Admin not found");

    await Promise.all(
      notificationIds.map(async (id) => {
        return prisma.adminNotification.upsert({
          where: {
            adminId_notificationId: {
              adminId: admin.id,
              notificationId: id,
            },
          },
          update: {
            seen: true,
            seenAt: new Date(),
          },
          create: {
            adminId: admin.id,
            notificationId: id,
            seen: true,
            seenAt: new Date(),
          },
        });
      })
    );

    res.status(200).json({
      success: true,
      message: "Notifications marked as seen",
    });
  } catch (error) {
    next(error);
  }
};
