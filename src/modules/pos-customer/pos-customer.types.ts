export interface CreatePosCustomerInput {
  name: string;
  phone: string;
}

export interface UpdatePosCustomerInput {
  name?: string;
}

export interface PosCustomerListQuery {
  page?: number;
  limit?: number;
  searchTerm?: string;
}

export interface PosCustomerOrderQuery {
  page?: number;
  limit?: number;
}
