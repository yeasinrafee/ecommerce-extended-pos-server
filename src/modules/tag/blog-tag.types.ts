export type CreateTagDto = {
    name: string;
};

export type UpdateTagDto = Partial<CreateTagDto>;

export type TagListQuery = {
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
