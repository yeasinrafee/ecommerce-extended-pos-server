export type CreateCompanyInformationDto = {
    email?: string;
    address?: string;
    phone?: string;
    shortDescription?: string;
    workingHours?: string;
    logo?: string | null;
    footerLogo?: string | null;
};

export type UpdateCompanyInformationDto = Partial<CreateCompanyInformationDto>;

export type CreateCompanyPolicyDto = {
    termsOfService?: string;
    termsAndConditions?: string;
    privacyPolicy?: string;
    refundPolicy?: string;
    shippingPolicy?: string;
    sizeChart?: string;
};

export type UpdateCompanyPolicyDto = Partial<CreateCompanyPolicyDto>;

export type CreateFaqDto = {
    question: string;
    answer: string;
};
export type UpdateFaqDto = Partial<CreateFaqDto> & { id: string; };

export type CreateSocialMediaLinkDto = {
    name: string;
    link: string;
};
export type UpdateSocialMediaLinkDto = Partial<CreateSocialMediaLinkDto> & { id: string; };

export type CreateSliderDto = {
    image: string;
    link?: string | null;
};
export type UpdateSliderDto = Partial<CreateSliderDto> & { id: string; serial?: number; };

export type CreateTestimonialDto = {
    name: string;
    designation: string;
    rating: number;
    comment: string;
    image?: string | null;
};
export type UpdateTestimonialDto = Partial<CreateTestimonialDto> & { id: string; };
