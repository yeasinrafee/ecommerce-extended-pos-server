import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { adminService } from './admin.service.js';
import { normalizeUploadedFiles, uploadMultipleFilesToCloudinary, deleteCloudinaryAsset } from '../../common/utils/file-upload.js';

const getAdmins = async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const searchTerm = typeof req.query.searchTerm === 'string' ? req.query.searchTerm : undefined;
    const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;

    const result = await adminService.getAdmins({ page, limit, searchTerm, status });

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Admins fetched',
        data: result.data,
        meta: {
            ...result.meta,
            timestamp: new Date().toISOString()
        }
    });
};

const getAdmin = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const admin = await adminService.getAdminById(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Admin fetched',
        data: admin
    });
};

const getProfile = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'Unauthorized', []);

    const admin = await adminService.getAdminByUserId(userId);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Profile fetched',
        data: admin
    });
};

const updateProfile = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'Unauthorized', []);

    const admin = await adminService.getAdminByUserId(userId);
    if (!admin) throw new AppError(404, 'Admin profile not found', []);

    const payload = req.body || {};
    let newlyUploadedPublicId: string | null = null;

    try {
        const files = normalizeUploadedFiles(req.files);
        if (files.length > 0) {
            const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
                projectFolder: 'admins',
                entityId: admin.id,
                fileNamePrefix: 'admin_profile'
            });

            const uploaded = uploadedFiles[0];
            payload.image = uploaded?.secureUrl ?? null;
            newlyUploadedPublicId = uploaded?.publicId ?? null;
        }

        const updated = await adminService.updateAdmin(admin.id, payload, newlyUploadedPublicId);

        sendResponse({
            res,
            statusCode: 200,
            success: true,
            message: 'Profile updated',
            data: updated
        });
    } catch (err) {
        if (newlyUploadedPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedPublicId);
            } catch (deleteErr) {
                console.warn('Failed to cleanup newly uploaded asset after profile update failure', { newlyUploadedPublicId });
            }
        }
        throw err;
    }
};

const updateAdmin = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;


    const payload = req.body || {};
    let newlyUploadedPublicId: string | null = null;

    try {
        const files = normalizeUploadedFiles(req.files);
        if (files.length > 0) {
            const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
                projectFolder: 'admins',
                entityId: id,
                fileNamePrefix: 'admin'
            });

            const uploaded = uploadedFiles[0];
            payload.image = uploaded?.secureUrl ?? null;
            newlyUploadedPublicId = uploaded?.publicId ?? null;
        }

        const updated = await adminService.updateAdmin(id, payload, newlyUploadedPublicId);

        sendResponse({
            res,
            statusCode: 200,
            success: true,
            message: 'Admin updated',
            data: updated
        });
        return;
    } catch (err) {
        if (newlyUploadedPublicId) {
            try {
                await deleteCloudinaryAsset(newlyUploadedPublicId);
            } catch (deleteErr) {
                console.warn('Failed to cleanup newly uploaded asset after update failure', { newlyUploadedPublicId, err: (deleteErr as Error).message });
            }
        }

        throw err;
    }

};

const deleteAdmin = async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    await adminService.deleteAdmin(id);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Admin deleted',
        data: null
    });
};

const getAllAdmins = async (req: Request, res: Response) => {
    const admins = await adminService.getAllAdmins();

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'All admins fetched',
        data: admins
    });
};

const bulkUpdateStatus = async (req: Request, res: Response) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const status = typeof req.body?.status === 'string' ? req.body.status : undefined;

    const count = await adminService.bulkUpdateStatus(ids, status);

    sendResponse({
        res,
        statusCode: 200,
        success: true,
        message: 'Statuses updated',
        data: { updated: count }
    });
};

export const adminController = {
    getAdmins,
    getAdmin,
    getProfile,
    updateProfile,
    updateAdmin,
    deleteAdmin,
    getAllAdmins,
    bulkUpdateStatus
};
