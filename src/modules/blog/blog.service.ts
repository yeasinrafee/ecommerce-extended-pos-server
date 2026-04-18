import { prisma } from '../../config/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateBlogDto, UpdateBlogDto, ServiceListResult, BlogListQuery } from './blog.types.js';
import { deleteCloudinaryAsset, getPublicIdFromUrl } from '../../common/utils/file-upload.js';

import type { Prisma } from '@prisma/client';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const slugifyTitle = (title: string) =>
    title
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');

const generateUniqueSlug = async (base: string, excludeId?: string, dbClient: any = prisma) => {
    const where: any = { slug: { startsWith: base } };
    if (excludeId) where.AND = { id: { not: excludeId } };

    const existing = await dbClient.blog.findMany({ where, select: { slug: true } });
    const slugs = existing.map((r: any) => r.slug);

    let max = -1;
    let hasPlain = false;
    const escapedBase = escapeRegExp(base);
    const regex = new RegExp(`^${escapedBase}-(\\d+)$`);

    for (const s of slugs) {
        if (s === base) hasPlain = true;
        const m = s.match(regex);
        if (m) {
            const n = parseInt(m[1], 10);
            if (!Number.isNaN(n) && n > max) max = n;
        }
    }

    if (!hasPlain && max === -1) return base;
    const next = max === -1 ? 1 : max + 1;
    return `${base}-${next}`;
};

const getBlogs = async ({ page = 1, limit = 10, searchTerm, category, tag }: BlogListQuery = {}): Promise<ServiceListResult<any>> => {
    const skip = (page - 1) * limit;
    
    const where: Prisma.BlogWhereInput = {};
    
    if (searchTerm) {
        where.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { authorName: { contains: searchTerm, mode: 'insensitive' } },
            { content: { contains: searchTerm, mode: 'insensitive' } }
        ];
    }

    const categoryFilter = category ? (Array.isArray(category) ? category : String(category).split('&')) : [];
    const tagFilter = tag ? (Array.isArray(tag) ? tag : String(tag).split('&')) : [];

    if (categoryFilter.length > 0 || tagFilter.length > 0) {
        const conditions: Prisma.BlogWhereInput[] = [];

        if (categoryFilter.length > 0) {
            conditions.push({
                category: {
                    slug: { in: categoryFilter }
                }
            });
        }

        if (tagFilter.length > 0) {
            conditions.push({
                tags: {
                    some: {
                        tag: {
                            slug: { in: tagFilter }
                        }
                    }
                }
            });
        }

        if (where.OR) {
            where.AND = [
                { OR: where.OR },
                { OR: conditions }
            ];
            delete where.OR;
        } else {
            where.OR = conditions;
        }
    }

    const [data, total] = await Promise.all([
        prisma.blog.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                category: true,
                tags: { include: { tag: true } },
                user: true,
                seos: true
            }
        }),
        prisma.blog.count({ where })
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

const getBlogById = async (id: string) => {
    return prisma.blog.findUnique({ 
        where: { id }, 
        include: { 
            category: true, 
            tags: { include: { tag: true } }, 
            user: true, 
            seos: true,
            comments: {
				where: { parentId: null },
				include: {
					user: {
						select: {
							id: true,
							email: true,
							customers: { select: { phone: true } },
							admins: { select: { name: true, image: true } }
						}
					},
					replies: {
						include: {
							user: {
								select: {
									id: true,
									email: true,
									customers: { select: { phone: true } },
									admins: { select: { name: true, image: true } }
								}
							}
						},
						orderBy: { createdAt: 'asc' }
					}
				},
				orderBy: { createdAt: 'desc' }
			}
        } 
    });
};

const getBlogBySlug = async (slug: string) => {
    return prisma.blog.findUnique({
        where: { slug },
        include: {
            category: true,
            tags: { include: { tag: true } },
            user: true,
            seos: true,
            comments: {
                where: { parentId: null },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            customers: { select: { phone: true } },
                            admins: { select: { name: true, image: true } }
                        }
                    },
                    replies: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    email: true,
                                    customers: { select: { phone: true } },
                                    admins: { select: { name: true, image: true } }
                                }
                            }
                        },
                        orderBy: { createdAt: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }
        }
    });
};

const createBlog = async ({ title, image, authorName, shortDescription, content, categoryId, tagIds = [], userId, seo }: CreateBlogDto) => {
    if (!userId) {
        throw new AppError(401, 'Unauthorized', [{ message: 'Missing user id', code: 'UNAUTHORIZED' }]);
    }
    // ensure title uniqueness (case-insensitive)
    const existingTitle = await prisma.blog.findFirst({ where: { title: { equals: title, mode: 'insensitive' } } });
    if (existingTitle) {
        throw new AppError(409, 'Blog title already exists', [{ message: 'A blog with this title already exists', code: 'DUPLICATE_TITLE' }]);
    }
    // generate a unique slug from title
    const baseSlug = slugifyTitle(title);
    const slug = await generateUniqueSlug(baseSlug);

    const created = await prisma.blog.create({
        data: {
            title,
            slug,
            image,
            authorName,
            shortDescription,
            content,
            user: { connect: { id: userId } },
            category: categoryId ? { connect: { id: categoryId } } : undefined,
            tags: Array.isArray(tagIds) && tagIds.length > 0 ? { create: tagIds.map((t) => ({ tag: { connect: { id: t } } })) } : undefined,
            seos:
                seo && (seo.title || seo.description || (Array.isArray(seo.keyword) && seo.keyword.length > 0))
                    ? { create: { title: seo.title ?? '', description: seo.description ?? undefined, keyword: Array.isArray(seo.keyword) ? seo.keyword : [] } }
                    : undefined
        },
        include: { category: true, tags: { include: { tag: true } }, user: true, seos: true }
    });

    return created;
};

const updateBlog = async (id: string, payload: UpdateBlogDto, newUploadedPublicId?: string | null) => {
    const existing = await prisma.blog.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError(404, 'Blog not found', [{ message: 'No blog exists with the provided id', code: 'NOT_FOUND' }]);
    }

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    const updated = await prisma.$transaction(async (tx) => {
        const data: any = {};

        if (payload.title) {
            // ensure no other blog (excluding current) has this title
            const dup = await tx.blog.findFirst({ where: { title: { equals: payload.title, mode: 'insensitive' }, id: { not: id } } });
            if (dup) {
                throw new AppError(409, 'Blog title already exists', [{ message: 'A blog with this title already exists', code: 'DUPLICATE_TITLE' }]);
            }
            data.title = payload.title;
            // regenerate slug (ensure uniqueness excluding current blog)
            const baseSlug = slugifyTitle(payload.title);
            const unique = await generateUniqueSlug(baseSlug, id, tx);
            data.slug = unique;
        }
        if (payload.image !== undefined) data.image = payload.image;
        if (payload.authorName) data.authorName = payload.authorName;
        if (payload.shortDescription) data.shortDescription = payload.shortDescription;
        if (payload.content) data.content = payload.content;

        if (Object.keys(data).length > 0) {
            await tx.blog.update({ where: { id }, data });
        }

        if (payload.tagIds !== undefined) {
            // replace tag relations
            await tx.tagsOnBlogs.deleteMany({ where: { blogId: id } });
            if (Array.isArray(payload.tagIds) && payload.tagIds.length > 0) {
                const createData = payload.tagIds.map((t) => ({ blogId: id, tagId: t }));
                await tx.tagsOnBlogs.createMany({ data: createData });
            }
        }

        if (payload.categoryId !== undefined) {
            // update single category relation
            if (payload.categoryId) {
                await tx.blog.update({ where: { id }, data: { category: { connect: { id: payload.categoryId } } } });
            } else {
                // if empty/null provided, clear category
                await tx.blog.update({ where: { id }, data: { category: { disconnect: true } } });
            }
        }

        if (payload.seo !== undefined) {
            // replace seo rows for this blog with the provided seo (if any)
            await tx.seo.deleteMany({ where: { blogId: id } });
            const seoObj = payload.seo as any;
            if (seoObj && (seoObj.title || seoObj.description || (Array.isArray(seoObj.keyword) && seoObj.keyword.length > 0))) {
                await tx.seo.create({ data: { title: seoObj.title, description: seoObj.description ?? undefined, keyword: Array.isArray(seoObj.keyword) ? seoObj.keyword : [], blog: { connect: { id } } } });
            }
        }

        return tx.blog.findUnique({ where: { id }, include: { category: true, tags: { include: { tag: true } }, user: true, seos: true } });
    });

    // Post-update cleanup: delete previous cloud asset if replaced
    try {
        if (newUploadedPublicId !== undefined) {
            const newPub = newUploadedPublicId ?? null;
            if (previousPublicId && previousPublicId !== newPub) {
                try {
                    await deleteCloudinaryAsset(previousPublicId);
                } catch (err) {
                    console.warn('Failed to delete previous cloud asset for blog', { previousPublicId, err: (err as Error).message });
                }
            }
        }

        if (payload.image === null && previousPublicId) {
            try {
                await deleteCloudinaryAsset(previousPublicId);
            } catch (err) {
                console.warn('Failed to delete previous cloud asset on explicit remove for blog', { previousPublicId, err: (err as Error).message });
            }
        }
    } catch (err) {
        console.warn('Unexpected error in post-update asset cleanup for blog', (err as Error).message);
    }

    return updated;
};

const deleteBlog = async (id: string) => {
    const existing = await prisma.blog.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError(404, 'Blog not found', [{ message: 'No blog exists with the provided id', code: 'NOT_FOUND' }]);
    }

    const previousPublicId = getPublicIdFromUrl(existing.image) ?? null;

    if (previousPublicId) {
        try {
            await deleteCloudinaryAsset(previousPublicId);
        } catch (err) {
            console.warn('Failed to delete cloud asset before blog removal', { previousPublicId, err: (err as Error).message });
            throw new AppError(500, 'Failed to delete associated image from cloud', [
                { message: (err as Error).message, code: 'CLOUD_DELETE_FAILED' }
            ]);
        }
    }

    // delete tag join rows and seos then blog
    await prisma.$transaction([prisma.tagsOnBlogs.deleteMany({ where: { blogId: id } }), prisma.seo.deleteMany({ where: { blogId: id } }), prisma.blog.delete({ where: { id } })]);
    return true;
};

const getAllBlogs = async ({ searchTerm, category, tag }: Omit<BlogListQuery, 'page' | 'limit'> = {}) => {
    const where: Prisma.BlogWhereInput = {};
    
    if (searchTerm) {
        where.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { authorName: { contains: searchTerm, mode: 'insensitive' } },
            { content: { contains: searchTerm, mode: 'insensitive' } }
        ];
    }

    const categoryFilter = category ? (Array.isArray(category) ? category : String(category).split('&')) : [];
    const tagFilter = tag ? (Array.isArray(tag) ? tag : String(tag).split('&')) : [];

    if (categoryFilter.length > 0 || tagFilter.length > 0) {
        const conditions: Prisma.BlogWhereInput[] = [];

        if (categoryFilter.length > 0) {
            conditions.push({
                category: {
                    slug: { in: categoryFilter }
                }
            });
        }

        if (tagFilter.length > 0) {
            conditions.push({
                tags: {
                    some: {
                        tag: {
                            slug: { in: tagFilter }
                        }
                    }
                }
            });
        }

        if (where.OR) {
            where.AND = [
                { OR: where.OR },
                { OR: conditions }
            ];
            delete where.OR;
        } else {
            where.OR = conditions;
        }
    }

    return prisma.blog.findMany({ where, orderBy: { createdAt: 'desc' }, include: { category: true, tags: { include: { tag: true } }, user: true, seos: true } });
};

const getRecentBlogs = async (limit: number = 5) => {
    return prisma.blog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
            category: true,
            tags: { include: { tag: true } },
            user: true,
            seos: true
        }
    });
};

export const blogService = {
    getBlogs,
    getBlogById,
    getBlogBySlug,
    getAllBlogs,
    getRecentBlogs,
    createBlog,
    updateBlog,
    deleteBlog
};
