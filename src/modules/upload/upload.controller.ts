import { Request, Response } from 'express';
import { sendResponse } from '../../common/utils/send-response.js';
import { normalizeUploadedFiles, uploadMultipleFilesToCloudinary } from '../../common/utils/file-upload.js';
import crypto from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

const uploadImage = async (req: Request, res: Response) => {
    try {
        const files = normalizeUploadedFiles(req.files);
        if (!files || files.length === 0) {
            throw new AppError(400, 'No files uploaded', [{ message: 'No files found in request', code: 'NO_FILES' }]);
        }

        const generatedId = crypto.randomUUID();
        // upload into the common `blogs` folder (no per-upload subfolder)
        const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
            projectFolder: 'blogs',
            entityId: generatedId,
            fileNamePrefix: 'blog'
        });

        const uploaded = uploadedFiles[0];

        sendResponse({
            res,
            statusCode: 200,
            success: true,
            message: 'File uploaded',
            data: { url: uploaded?.secureUrl ?? null, publicId: uploaded?.publicId ?? null }
        });
        return;
    } catch (err) {
        throw err;
    }
};

// exported at bottom with both handlers

const deleteImage = async (req: Request, res: Response) => {
    const { publicId, url } = req.body || {};

    if (!publicId && !url) {
        throw new AppError(400, 'publicId or url is required', [{ message: 'Provide publicId or url to delete', code: 'MISSING_PUBLIC_ID' }]);
    }

    const derivedFromUrl = getPublicIdFromUrl(url);
    const fallbackAsPublicId =
        !publicId && !derivedFromUrl && typeof url === 'string' && url.trim().length > 0 && !/^https?:\/\//i.test(url)
            ? url.trim()
            : null;

    const pid = publicId ?? derivedFromUrl ?? fallbackAsPublicId;
    if (!pid) {
        throw new AppError(400, 'Could not determine public id from url', [{ message: 'Invalid url or publicId', code: 'INVALID_PUBLIC_ID' }]);
    }

    try {
        await deleteCloudinaryAsset(pid);
        sendResponse({ res, statusCode: 200, success: true, message: 'Deleted', data: null });
        return;
    } catch (err) {
        throw err;
    }
};

export const uploadController = {
    uploadImage,
    deleteImage
};
