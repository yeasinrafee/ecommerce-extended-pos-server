export type CreateBlogDto = {
    title: string;
    image?: string | null;
    authorName: string;
    shortDescription: string;
    content: string;
    categoryId?: string;
    tagIds?: string[];
    seo?: {
        title: string;
        description?: string | null;
        keyword?: string[];
    } | null;
    userId?: string;
};

export type UpdateBlogDto = Partial<CreateBlogDto> & { tagIds?: string[] | null };

export type BlogListQuery = {
    page?: number;
    limit?: number;
    searchTerm?: string;
    category?: string | string[];
    tag?: string | string[];
};

export type ServiceListResult<T> = {
    data: T[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};
