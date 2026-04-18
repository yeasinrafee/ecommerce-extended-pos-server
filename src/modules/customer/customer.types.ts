import { Status } from "@prisma/client";

export interface CustomerListQuery {
    page?: number;
    limit?: number;
    searchTerm?: string;
    status?: Status;
}

export interface UpdateCustomerDto {
    name?: string;
    email?: string;
    image?: string;
    phone?: string;
    oldPassword?: string;
    newPassword?: string;
}

export interface BulkUpdateStatusDto {
    ids: string[];
    status: Status;
}
