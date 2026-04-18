export type Status = 'ACTIVE' | 'INACTIVE';

export type UpdateAdminDto = {
    name?: string;
    email?: string;
    status?: Status;
    image?: string | null;
    oldPassword?: string;
    newPassword?: string;
};

export type AdminListQuery = {
    page?: number;
    limit?: number;
    searchTerm?: string;
    status?: Status;
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
