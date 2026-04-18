import { z } from "zod";
import { Role } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { AuthTokens } from "../../common/utils/token.js";

const parsePayload = <Schema extends z.ZodTypeAny>(
  schema: Schema,
  payload: unknown,
): z.infer<Schema> => {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new AppError(
      400,
      "Validation failed",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || undefined,
        message: issue.message,
        code: "VALIDATION_ERROR",
      })),
    );
  }

  return parsed.data;
};

export const createAdminSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .min(2, "Name must be at least 2 characters"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("A valid email address is required"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot be longer than 100 characters"),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const validateCreateAdminPayload = (
  payload: unknown,
): CreateAdminInput => parsePayload(createAdminSchema, payload);

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("A valid email address is required"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot be longer than 100 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const validateLoginPayload = (payload: unknown): LoginInput =>
  parsePayload(loginSchema, payload);

export const verifyOtpSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  code: z.string().trim().min(4, "OTP is required").max(10, "OTP is too long"),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const validateVerifyOtpPayload = (payload: unknown): VerifyOtpInput =>
  parsePayload(verifyOtpSchema, payload);

export const sendOtpSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export const validateSendOtpPayload = (payload: unknown): SendOtpInput =>
  parsePayload(sendOtpSchema, payload);

export const forgotPasswordSendOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("A valid email address is required"),
});
export type ForgotPasswordSendOtpInput = z.infer<
  typeof forgotPasswordSendOtpSchema
>;
export const validateForgotPasswordSendOtpPayload = (
  payload: unknown,
): ForgotPasswordSendOtpInput =>
  parsePayload(forgotPasswordSendOtpSchema, payload);

export const forgotPasswordVerifyOtpSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  code: z.string().trim().min(4, "OTP is required").max(10, "OTP is too long"),
});
export type ForgotPasswordVerifyOtpInput = z.infer<
  typeof forgotPasswordVerifyOtpSchema
>;
export const validateForgotPasswordVerifyOtpPayload = (
  payload: unknown,
): ForgotPasswordVerifyOtpInput =>
  parsePayload(forgotPasswordVerifyOtpSchema, payload);

export const registerCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .min(2, "Name must be at least 2 characters"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("A valid email address is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot be longer than 100 characters"),
});

export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const validateRegisterCustomerPayload = (
  payload: unknown,
): RegisterCustomerInput => parsePayload(registerCustomerSchema, payload);

export const resetPasswordSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  code: z.string().trim().min(4, "OTP is required").max(10, "OTP is too long"),
  newPassword: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot be longer than 100 characters"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export const validateResetPasswordPayload = (
  payload: unknown,
): ResetPasswordInput => parsePayload(resetPasswordSchema, payload);

export interface CustomerUserShape {
  id: string;
  email: string;
  role: Role;
  name: string;
  phone: string | null;
  image: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export type AdminUserShape = {
  id: string;
  email: string;
  role: Role;
  name: string;
  image: string | null;
  status: "ACTIVE" | "INACTIVE" | null;
  otpExpiry?: string | null;
};

export type CreateAdminResult = {
  user: AdminUserShape;
};

export type AuthResult = {
  user: AdminUserShape | CustomerUserShape;
  tokens: AuthTokens;
};
