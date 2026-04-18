export type CreateAttributeDto = {
    name: string;
    values?: string[];
};

export type UpdateAttributeDto = Partial<CreateAttributeDto>;

export type AttributeListQuery = {
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
