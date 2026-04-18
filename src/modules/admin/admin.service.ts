import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import bcrypt from 'bcryptjs';
import type { UpdateAdminDto, ServiceListResult, AdminListQuery } from './admin.types.js';
import type { Prisma } from '@prisma/client';
import { Role } from '@prisma/client';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

const getAdmins = async ({ page = 1, limit = 10, searchTerm, status }: AdminListQuery = {}): Promise<ServiceListResult<any>> => {
    const skip = (page - 1) * limit;

    const where: Prisma.AdminWhereInput = {
        user: { role: Role.ADMIN, verified: true }
    };

    if (searchTerm) {
        where.AND = [
            {
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { user: { email: { contains: searchTerm, mode: 'insensitive' } } }
                ]
            }
        ];
    }

    if (status) {
        Object.assign(where, { status });
    }

    const [data, total] = await Promise.all([
        prisma.admin.findMany({ where, skip, take: limit, include: { user: true }, orderBy: { createdAt: 'desc' } }),
        prisma.admin.count({ where })
    ]);

    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};

const getAdminById = async (id: string) => {
    return prisma.admin.findFirst({ where: { id, user: { verified: true } }, include: { user: true } });
};

const getAdminByUserId = async (userId: string) => {
    return prisma.admin.findFirst({
        where: { userId },
        include: { user: true }
    });
};

const updateAdmin = async (id: string, payload: UpdateAdminDto, newUploadedPublicId?: string | null) => {
    const existing = await prisma.admin.findFirst({ where: { id, user: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } } } });
    if (!existing) {
        throw new AppError(404, 'Admin not found', [{ message: 'No admin exists with the provided id', code: 'NOT_FOUND' }]);
    }

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    const updated = await prisma.$transaction(async (tx) => {
        if (payload.email) {
            const other = await tx.user.findUnique({ where: { email: payload.email } });
            if (other && other.id !== existing.userId) {
                throw new AppError(409, 'Email already registered', [{ field: 'email', message: 'Another user uses this email', code: 'EMAIL_ALREADY_EXISTS' }]);
            }

            await tx.user.update({ where: { id: existing.userId }, data: { email: payload.email } });
        }

        if (payload.oldPassword && payload.newPassword) {
            if (payload.oldPassword.length < 8 || payload.newPassword.length < 8) {
                throw new AppError(400, 'Password must be at least 8 characters', [{ field: 'newPassword', message: 'Password must be at least 8 characters' }]);
            }
            const userForPassword = await tx.user.findUnique({ where: { id: existing.userId } });
            if (!userForPassword) throw new AppError(404, 'User not found', []);
            const isMatch = await bcrypt.compare(payload.oldPassword, userForPassword.password);
            if (!isMatch) {
                throw new AppError(400, 'Invalid old password', [{ field: 'oldPassword', message: 'Old password does not match' }]);
            }
            
            const hashedPassword = await bcrypt.hash(payload.newPassword, 12);
            await tx.user.update({ where: { id: existing.userId }, data: { password: hashedPassword } });
        }

        const adminData: any = {};
        if (typeof payload.name === 'string') adminData.name = payload.name;
        if (payload.status !== undefined) adminData.status = payload.status as any;
        
        // Handle image update in payload
        if (payload.image !== undefined) adminData.image = payload.image;

        const updatedAdmin = await tx.admin.update({ where: { id }, data: adminData });
        const user = await tx.user.findUnique({ where: { id: existing.userId } });

        return {
            ...updatedAdmin,
            user
        };
    });

    // Handle Cloudinary asset cleanup after successful transaction
    try {
        const hasNewImage = newUploadedPublicId !== undefined && newUploadedPublicId !== null;
        const explicitlyRemovedImage = payload.image === null;

        if (previousPublicId && (hasNewImage || explicitlyRemovedImage)) {
            // Only delete if the publicId is indeed different (avoid deleting if same image re-uploaded somehow)
            if (previousPublicId !== newUploadedPublicId) {
                try {
                    await deleteCloudinaryAsset(previousPublicId);
                } catch (err) {
                    console.warn('Failed to delete previous cloud asset', { previousPublicId, err: (err as Error).message });
                }
            }
        }
    } catch (err) {
        console.warn('Unexpected error in post-update asset cleanup', (err as Error).message);
    }

    return updated;
};

const deleteAdmin = async (id: string) => {
    const existing = await prisma.admin.findFirst({ where: { id, user: { role: Role.ADMIN } } });
    if (!existing) {
        throw new AppError(404, 'Admin not found', [{ message: 'No admin exists with the provided id', code: 'NOT_FOUND' }]);
    }
    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    // Delete at the VERY end or before transaction? 
    // To ensure atomicity with Cloudinary, we should delete AFTER DB deletion is successful.
    // However, if DB fails, we still have the file. If Cloudinary fails, we can either rollback DB (via transaction) or just log it.

    await prisma.$transaction(async (tx) => {
        await tx.admin.delete({ where: { id } });
        await tx.user.delete({ where: { id: existing.userId } });
    });

    if (previousPublicId) {
        try {
            await deleteCloudinaryAsset(previousPublicId);
        } catch (err) {
            console.warn('Failed to delete cloud asset after admin removal', { previousPublicId, err: (err as Error).message });
            // Don't throw here as the Record is already deleted from DB. Orphaned file is better than inconsistent DB/Client state.
        }
    }

    return true;
};

const getAllAdmins = async () => {
    return prisma.admin.findMany({ where: { user: { role: Role.ADMIN, verified: true } }, include: { user: true }, orderBy: { createdAt: 'desc' } });
};

const adminServiceObj = {
    getAdmins,
    getAdminById,
    getAdminByUserId,
    getAllAdmins,
    updateAdmin,
    deleteAdmin
};


const bulkUpdateStatus = async (ids: string[], status: string) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError(400, 'No ids provided', [{ message: 'Provide an array of admin ids', code: 'INVALID_PAYLOAD' }]);
    }

    const result = await prisma.admin.updateMany({ where: { id: { in: ids } }, data: { status: status as any } });

    return result.count;
};

export const adminService = Object.assign(adminServiceObj, { bulkUpdateStatus });
