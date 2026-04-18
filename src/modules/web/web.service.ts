import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { 
    CreateCompanyInformationDto, UpdateCompanyInformationDto, CreateCompanyPolicyDto, UpdateCompanyPolicyDto, 
    CreateFaqDto, UpdateFaqDto, CreateSocialMediaLinkDto, UpdateSocialMediaLinkDto, 
    CreateSliderDto, UpdateSliderDto, CreateTestimonialDto, UpdateTestimonialDto 
} from './web.types.js';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

// --- Company Information ---
const getCompanyInformation = async () => {
    return prisma.companyInformation.findFirst();
};

const createOrUpdateCompanyInformation = async (payload: CreateCompanyInformationDto, newlyUploadedLogoPublicId?: string | null, newlyUploadedFooterLogoPublicId?: string | null) => {
    const existing = await prisma.companyInformation.findFirst();

    if (existing) {
        if (payload.logo && existing.logo) {
            const previousPublicId = getPublicIdFromUrl(existing.logo);
            if (previousPublicId && previousPublicId !== newlyUploadedLogoPublicId) {
                try {
                    await deleteCloudinaryAsset(previousPublicId);
                } catch (err) {
                    console.warn('Failed to delete old company information logo asset', { previousPublicId, err: (err as Error).message });
                }
            }
        }
        if (payload.footerLogo && existing.footerLogo) {
            const previousPublicId = getPublicIdFromUrl(existing.footerLogo);
            if (previousPublicId && previousPublicId !== newlyUploadedFooterLogoPublicId) {
                try {
                    await deleteCloudinaryAsset(previousPublicId);
                } catch (err) {
                    console.warn('Failed to delete old company information footer logo asset', { previousPublicId, err: (err as Error).message });
                }
            }
        }
        return prisma.companyInformation.update({
            where: { id: existing.id },
            data: payload
        });
    }

    return prisma.companyInformation.create({ data: payload });
};

const updateCompanyInformation = async (payload: UpdateCompanyInformationDto, newlyUploadedLogoPublicId?: string | null, newlyUploadedFooterLogoPublicId?: string | null) => {
    const existing = await prisma.companyInformation.findFirst();
    if (!existing) {
        throw new AppError(404, 'Company information not found', [{ message: 'No company info exists to update', code: 'NOT_FOUND' }]);
    }

    if (payload.logo && existing.logo) {
        const previousPublicId = getPublicIdFromUrl(existing.logo);
        if (previousPublicId && previousPublicId !== newlyUploadedLogoPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete old company information logo asset', { previousPublicId, err: (err as Error).message });
            }
        }
    }

    if (payload.footerLogo && existing.footerLogo) {
        const previousPublicId = getPublicIdFromUrl(existing.footerLogo);
        if (previousPublicId && previousPublicId !== newlyUploadedFooterLogoPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete old company information footer logo asset', { previousPublicId, err: (err as Error).message });
            }
        }
    }

    return prisma.companyInformation.update({
        where: { id: existing.id },
        data: payload
    });
};

const deleteCompanyInformation = async () => {
    const existing = await prisma.companyInformation.findFirst();
    if (!existing) {
        throw new AppError(404, 'Company information not found', [{ message: 'No company info exists to delete', code: 'NOT_FOUND' }]);
    }

    if (existing.logo) {
        const previousPublicId = getPublicIdFromUrl(existing.logo);
        if (previousPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete old company information image asset', { previousPublicId, err: (err as Error).message });
            }
        }
    }

    if (existing.footerLogo) {
        const previousPublicId = getPublicIdFromUrl(existing.footerLogo);
        if (previousPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete old company information footer logo asset', { previousPublicId, err: (err as Error).message });
            }
        }
    }

    await prisma.companyInformation.delete({ where: { id: existing.id } });
    return true;
};

// --- Company Policy ---
const getCompanyPolicy = async () => {
    return prisma.companyPolicy.findFirst();
};

const createOrUpdateCompanyPolicy = async (payload: CreateCompanyPolicyDto, newlyUploadedPublicId?: string | null) => {
    const existing = await prisma.companyPolicy.findFirst();

    if (existing) {
        if ((payload.sizeChart === "" || (payload.sizeChart && payload.sizeChart !== existing.sizeChart)) && existing.sizeChart) {
            const previousPublicId = getPublicIdFromUrl(existing.sizeChart);
            if (previousPublicId && previousPublicId !== newlyUploadedPublicId) {
                try {
                    await deleteCloudinaryAsset(previousPublicId);
                } catch (err) {
                    console.warn('Failed to delete old company policy size chart asset', { previousPublicId, err: (err as Error).message });
                }
            }
        }
        return prisma.companyPolicy.update({
            where: { id: existing.id },
            data: payload
        });
    }
    return prisma.companyPolicy.create({ data: payload });
};

const updateCompanyPolicy = async (payload: UpdateCompanyPolicyDto, newlyUploadedPublicId?: string | null) => {
    const existing = await prisma.companyPolicy.findFirst();
    if (!existing) {
        throw new AppError(404, 'Company policy not found', [{ message: 'No company policy exists to update', code: 'NOT_FOUND' }]);
    }

    // Handle removal or replacement of sizeChart image
    if ((payload.sizeChart === "" || (payload.sizeChart && payload.sizeChart !== existing.sizeChart)) && existing.sizeChart) {
        const previousPublicId = getPublicIdFromUrl(existing.sizeChart);
        if (previousPublicId && previousPublicId !== newlyUploadedPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete old company policy size chart asset', { previousPublicId, err: (err as Error).message });
            }
        }
    }

    return prisma.companyPolicy.update({
        where: { id: existing.id },
        data: payload
    });
};

const deleteCompanyPolicy = async () => {
    const existing = await prisma.companyPolicy.findFirst();
    if (!existing) {
        throw new AppError(404, 'Company policy not found', [{ message: 'No company policy exists', code: 'NOT_FOUND' }]);
    }

    if (existing.sizeChart) {
        const previousPublicId = getPublicIdFromUrl(existing.sizeChart);
        if (previousPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete company policy size chart asset on policy deletion', { previousPublicId, err: (err as Error).message });
            }
        }
    }

    await prisma.companyPolicy.delete({ where: { id: existing.id } });
    return true;
};

// --- Faq ---
const getFaqs = async () => prisma.faq.findMany({ orderBy: { createdAt: 'desc' } });
const getFaq = async (id: string) => prisma.faq.findUnique({ where: { id } });
const createFaq = async (payload: CreateFaqDto | CreateFaqDto[]) => {
    if (Array.isArray(payload)) {
        return prisma.$transaction(payload.map(data => prisma.faq.create({ data })));
    }
    return prisma.faq.create({ data: payload });
};
const updateFaq = async (payload: UpdateFaqDto | UpdateFaqDto[]) => {
    if (Array.isArray(payload)) {
        return prisma.$transaction(payload.map(data => prisma.faq.update({ where: { id: data.id }, data })));
    }
    return prisma.faq.update({ where: { id: payload.id }, data: payload });
};
const deleteFaq = async (ids: string | string[]) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    return prisma.faq.deleteMany({ where: { id: { in: idArray } } });
};

// --- SocialMediaLink ---
const getSocialMediaLinks = async () => prisma.socialMediaLink.findMany({ orderBy: { createdAt: 'desc' } });
const getSocialMediaLink = async (id: string) => prisma.socialMediaLink.findUnique({ where: { id } });
const createSocialMediaLink = async (payload: CreateSocialMediaLinkDto | CreateSocialMediaLinkDto[]) => {
    if (Array.isArray(payload)) {
        return prisma.$transaction(payload.map(data => prisma.socialMediaLink.create({ data })));
    }
    return prisma.socialMediaLink.create({ data: payload });
};
const updateSocialMediaLink = async (payload: UpdateSocialMediaLinkDto | UpdateSocialMediaLinkDto[]) => {
    if (Array.isArray(payload)) {
        return prisma.$transaction(payload.map(data => prisma.socialMediaLink.update({ where: { id: data.id }, data })));
    }
    return prisma.socialMediaLink.update({ where: { id: payload.id }, data: payload });
};
const deleteSocialMediaLink = async (ids: string | string[]) => {
    const idArray = Array.isArray(ids) ? ids : [ids];

    // Use a transaction to ensure atomicity when deleting multiple records.
    // This also makes it safe to add additional cleanup logic later.
    const [result] = await prisma.$transaction([
        prisma.socialMediaLink.deleteMany({ where: { id: { in: idArray } } })
    ]);

    return result;
};

// --- Slider ---
const getSliders = async () => prisma.slider.findMany({ orderBy: { serial: 'asc' } });
const getSlider = async (id: string) => prisma.slider.findUnique({ where: { id } });
const getSlidersByIds = async (ids: string[]) => prisma.slider.findMany({ where: { id: { in: ids } } });
const createSlider = async (payload: CreateSliderDto | CreateSliderDto[]) => {
    if (Array.isArray(payload)) {
        const maxRes = await prisma.slider.aggregate({ _max: { serial: true } });
        let nextSerial = (maxRes._max.serial ?? 0) + 1;

        const createData = payload.map(p => ({ ...p, serial: nextSerial++ }));
        return prisma.$transaction(createData.map(data => prisma.slider.create({ data })));
    }

    const maxRes = await prisma.slider.aggregate({ _max: { serial: true } });
    const newSerial = (maxRes._max.serial ?? 0) + 1;
    const data = { ...payload, serial: newSerial };
    return prisma.slider.create({ data });
};
const updateSlider = async (payload: UpdateSliderDto | UpdateSliderDto[]) => {
    if (Array.isArray(payload)) {
        if (!payload.length) return [];

        const normalized = payload.map((item, index) => ({
            ...item,
            serial: typeof item.serial === 'number' ? item.serial : index + 1,
        }));

        return prisma.$transaction(async (tx) => {
            for (let index = 0; index < normalized.length; index += 1) {
                await tx.slider.update({
                    where: { id: normalized[index].id },
                    data: { serial: -(index + 1) },
                });
            }

            const updated: any[] = [];
            for (const item of normalized) {
                const { id, ...rest } = item;
                updated.push(await tx.slider.update({ where: { id }, data: rest }));
            }

            return updated;
        });
    }

    const { id, ...rest } = payload;
    return prisma.slider.update({ where: { id }, data: rest });
};
const deleteSlider = async (ids: string | string[]) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    const existing = await prisma.slider.findMany({ where: { id: { in: idArray } } });
    const deleted = await prisma.slider.deleteMany({ where: { id: { in: idArray } } });
    for (const item of existing) {
        if (item.image) {
            const pubId = getPublicIdFromUrl(item.image);
            if (pubId) await deleteCloudinaryAsset(pubId).catch(() => {});
        }
    }
    return deleted;
};

// --- Testimonial ---
const getTestimonials = async () => prisma.testimonial.findMany({ orderBy: { createdAt: 'desc' } });
const getTestimonial = async (id: string) => prisma.testimonial.findUnique({ where: { id } });
const getTestimonialsByIds = async (ids: string[]) => prisma.testimonial.findMany({ where: { id: { in: ids } } });
const createTestimonial = async (payload: CreateTestimonialDto | CreateTestimonialDto[]) => {
    if (Array.isArray(payload)) {
        return prisma.$transaction(payload.map(data => prisma.testimonial.create({ data })));
    }
    return prisma.testimonial.create({ data: payload });
};
const updateTestimonial = async (payload: UpdateTestimonialDto | UpdateTestimonialDto[]) => {
    if (Array.isArray(payload)) {
        return prisma.$transaction(payload.map(data => prisma.testimonial.update({ where: { id: data.id }, data })));
    }
    return prisma.testimonial.update({ where: { id: payload.id }, data: payload });
};
const deleteTestimonial = async (ids: string | string[]) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    const existing = await prisma.testimonial.findMany({ where: { id: { in: idArray } } });
    const deleted = await prisma.testimonial.deleteMany({ where: { id: { in: idArray } } });
    for (const item of existing) {
        if (item.image) {
            const pubId = getPublicIdFromUrl(item.image);
            if (pubId) await deleteCloudinaryAsset(pubId).catch(() => {});
        }
    }
    return deleted;
};

export const webService = {
    getCompanyInformation,
    createOrUpdateCompanyInformation,
    updateCompanyInformation,
    deleteCompanyInformation,
    getCompanyPolicy,
    createOrUpdateCompanyPolicy,
    updateCompanyPolicy,
    deleteCompanyPolicy,
    getFaqs, getFaq, createFaq, updateFaq, deleteFaq,
    getSocialMediaLinks, getSocialMediaLink, createSocialMediaLink, updateSocialMediaLink, deleteSocialMediaLink,
    getSliders, getSlider, getSlidersByIds, createSlider, updateSlider, deleteSlider,
    getTestimonials, getTestimonialsByIds, getTestimonial, createTestimonial, updateTestimonial, deleteTestimonial
};
