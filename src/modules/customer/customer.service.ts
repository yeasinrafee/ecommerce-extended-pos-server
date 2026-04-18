import { prisma } from "../../config/prisma.js";
import { Prisma, Status } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AppError } from "../../common/errors/app-error.js";
import { CustomerListQuery, UpdateCustomerDto, BulkUpdateStatusDto } from "./customer.types.js";

const getCustomers = async (query: CustomerListQuery) => {
    const { page = 1, limit = 20, searchTerm, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {};

    if (searchTerm) {
        where.OR = [
            { phone: { contains: searchTerm, mode: 'insensitive' } },
            { user: { email: { contains: searchTerm, mode: 'insensitive' } } }
        ];
    }

    if (status) {
        where.status = status;
    }

    const [data, total] = await Promise.all([
        prisma.customer.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        verified: true
                    }
                }
            }
        }),
        prisma.customer.count({ where })
    ]);

    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const updateCustomer = async (id: string, userId: string, payload: UpdateCustomerDto) => {
    const { email, phone, oldPassword, newPassword, ...customerData } = payload;

    return prisma.$transaction(async (tx) => {
        if (email) {
            const existingUser = await tx.user.findFirst({
                where: {
                    email,
                    id: { not: userId }
                }
            });

            if (existingUser) {
                throw new AppError(409, "Email already in use", [
                    { field: "email", message: "This email is already taken", code: "EMAIL_ALREADY_EXISTS" }
                ]);
            }

            await tx.user.update({
                where: { id: userId },
                data: { email }
            });
        }

        if (phone) {
            const existingPhone = await tx.customer.findFirst({
                where: {
                    phone,
                    id: { not: id }
                }
            });

            if (existingPhone) {
                throw new AppError(409, "Phone number already in use", [
                    { field: "phone", message: "This phone number is already taken", code: "PHONE_ALREADY_EXISTS" }
                ]);
            }
        }

        if (oldPassword || newPassword) {
            if (!oldPassword || !newPassword) {
                throw new AppError(400, "Password update requires oldPassword and newPassword", [
                    { field: "newPassword", message: "Provide both oldPassword and newPassword" }
                ]);
            }

            if (oldPassword.length < 8 || newPassword.length < 8) {
                throw new AppError(400, "Password must be at least 8 characters", [
                    { field: "newPassword", message: "Password must be at least 8 characters" }
                ]);
            }

            const userForPassword = await tx.user.findUnique({ where: { id: userId } });
            if (!userForPassword) {
                throw new AppError(404, "User not found", []);
            }

            const isMatch = await bcrypt.compare(oldPassword, userForPassword.password);
            if (!isMatch) {
                throw new AppError(400, "Invalid old password", [
                    { field: "oldPassword", message: "Old password does not match" }
                ]);
            }

            const hashedPassword = await bcrypt.hash(newPassword, 12);
            await tx.user.update({ where: { id: userId }, data: { password: hashedPassword } });
        }

        return tx.customer.update({
            where: { id },
            data: {
                ...customerData,
                phone
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        verified: true
                    }
                }
            }
        });
    });
};

const getCustomerById = async (id: string) => {
    return prisma.customer.findUnique({
        where: { id }
    });
};

const getCustomerAddressesByUserId = async (userId: string) => {
    const customer = await prisma.customer.findUnique({
        where: { userId },
        select: {
            id: true
        }
    });

    if (!customer) {
        throw new AppError(404, "Customer not found");
    }

    return prisma.address.findMany({
        where: {
            customerId: customer.id,
            deletedAt: null
        },
        orderBy: {
            createdAt: "desc"
        },
        include: {
            zone: true
        }
    });
};

const deleteCustomerAddressByUserId = async (userId: string, addressId: string) => {
    return prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
            where: { userId },
            select: {
                id: true
            }
        });

        if (!customer) {
            throw new AppError(404, "Customer not found");
        }

        const address = await tx.address.findFirst({
            where: {
                id: addressId,
                customerId: customer.id
            }
        });

        if (!address) {
            throw new AppError(404, "Address not found");
        }

        return tx.address.update({
            where: {
                id: addressId
            },
            data: {
                deletedAt: new Date()
            }
        });
    });
};

const bulkUpdateStatus = async (payload: BulkUpdateStatusDto) => {
    return prisma.customer.updateMany({
        where: {
            id: { in: payload.ids }
        },
        data: {
            status: payload.status
        }
    });
};

export const customerService = {
    getCustomers,
    updateCustomer,
    getCustomerById,
    getCustomerAddressesByUserId,
    deleteCustomerAddressByUserId,
    bulkUpdateStatus
};
