import { prisma } from '../../config/prisma.js';

const productInclude = {
	brand: true,
	categories: { include: { category: true } },
	tags: { include: { tag: true } },
	productVariations: { where: { deletedAt: null }, include: { attribute: true } },
} as const;

const getProducts = async (searchTerm?: string) => {
	return prisma.product.findMany({
		where: {
			deletedAt: null,
			...(searchTerm ? { name: { contains: searchTerm, mode: 'insensitive' } } : {})
		},
		orderBy: { createdAt: 'desc' },
		take: 50,
		include: productInclude
	});
};

export const posService = {
	getProducts
};