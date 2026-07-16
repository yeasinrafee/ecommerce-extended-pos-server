// Legacy types file - types are now defined inline and via Zod validators.
// Kept for backward compatibility with any remaining references.

export type ServiceListResult<T> = {
	data: T[];
	meta: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
};