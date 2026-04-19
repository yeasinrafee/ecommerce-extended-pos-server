export type CreateBankDto = {
	bankName: string;
	branch: string;
	accountNumber: string;
};

export type UpdateBankDto = Partial<CreateBankDto>;