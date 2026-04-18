export type CreateCategoryDto = {
    name: string;
    image?: string | null;
    parentId?: string | null;
};

export type UpdateCategoryDto = Partial<CreateCategoryDto>;

export type CategoryListQuery = {
    page?: number;
    limit?: number;
    searchTerm?: string;
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
