import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/app-error.js";
import {
  generateAuthTokens,
  verifyRefreshToken,
} from "../../common/utils/token.js";
import {
  deleteCloudinaryAsset,
  uploadMultipleFilesToCloudinary,
} from "../../common/utils/file-upload.js";
import { otpService } from "../../common/services/otp.service.js";
import {
  CreateAdminInput,
  CreateAdminResult,
  LoginInput,
  AuthResult,
  VerifyOtpInput,
  SendOtpInput,
  ForgotPasswordSendOtpInput,
  ForgotPasswordVerifyOtpInput,
  ResetPasswordInput,
  RegisterCustomerInput
} from "./auth.types.js";

const registerCustomer = async (
  payload: RegisterCustomerInput,
): Promise<{ userId: string; email: string; otpExpiry: string | null }> => {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (existingUser && existingUser.verified) {
    throw new AppError(409, "Email is already registered", [
      {
        field: "email",
        message: "A user with this email already exists",
        code: "EMAIL_ALREADY_EXISTS",
      },
    ]);
  }

  const existingPhone = await prisma.customer.findUnique({
    where: {
      phone: payload.phone,
    },
  });

  if (existingPhone) {
    throw new AppError(409, "Phone number is already in use", [
      {
        field: "phone",
        message: "This phone number is already registered",
        code: "PHONE_ALREADY_EXISTS",
      },
    ]);
  }

  const hashedPassword = await bcrypt.hash(payload.password, 12);
  const generatedUserId = crypto.randomUUID();

  const creationResult = await prisma.$transaction(async (tx) => {
    if (existingUser) {
      const customer = await tx.customer.findUnique({ where: { userId: existingUser.id } });
      if (customer) {
        await tx.wishlistItem.deleteMany({ where: { wishlist: { customerId: customer.id } } });
        await tx.wishlist.deleteMany({ where: { customerId: customer.id } });
        await tx.address.deleteMany({ where: { customerId: customer.id } });
        await tx.customer.delete({ where: { id: customer.id } });
      }
      await tx.oTP.deleteMany({ where: { userId: existingUser.id } });
      await tx.user.delete({ where: { id: existingUser.id } });
    }

    const user = await tx.user.create({
      data: {
        id: generatedUserId,
        email: payload.email,
        password: hashedPassword,
        role: Role.CUSTOMER,
        verified: false,
      },
    });

    const customer = await tx.customer.create({
      data: {
        userId: user.id,
        name: payload.name,
        phone: payload.phone,
      },
    });

    await tx.wishlist.create({
      data: {
        customerId: customer.id,
      },
    });

    return { user, customer };
  });

  let otpExpiry: Date | undefined;
  try {
    otpExpiry = await otpService.generate({
      userId: creationResult.user.id,
      to: creationResult.user.email,
    });
  } catch (otpErr) {
    await prisma.$transaction(async (tx) => {
      await tx.wishlist.deleteMany({ where: { customerId: creationResult.customer.id } });
      await tx.customer.delete({ where: { id: creationResult.customer.id } });
      await tx.user.delete({ where: { id: creationResult.user.id } });
    });
    throw otpErr;
  }

  return {
    userId: creationResult.user.id,
    email: creationResult.user.email,
    otpExpiry: otpExpiry?.toISOString() ?? null,
  };
};

const createAdmin = async (
  payload: CreateAdminInput,
  files: Express.Multer.File[],
): Promise<CreateAdminResult> => {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (existingUser && existingUser.verified) {
    throw new AppError(409, "Email is already registered", [
      {
        field: "email",
        message: "A user with this email already exists",
        code: "EMAIL_ALREADY_EXISTS",
      },
    ]);
  }

  const hashedPassword = await bcrypt.hash(payload.password, 12);
  const generatedUserId = crypto.randomUUID();

  let profileImage: string | null = null;
  let uploadedImagePublicId: string | null = null;

  if (files.length > 0) {
    const uploadedFiles = await uploadMultipleFilesToCloudinary(files, {
      projectFolder: "admins",
      entityId: generatedUserId,
      fileNamePrefix: "admin",
    });

    profileImage = uploadedFiles[0]?.secureUrl ?? null;
    uploadedImagePublicId = uploadedFiles[0]?.publicId ?? null;
  }

  try {
    const creationResult = await prisma.$transaction(async (tx) => {
      if (existingUser) {
        await tx.admin.deleteMany({ where: { userId: existingUser.id } });
        await tx.oTP.deleteMany({ where: { userId: existingUser.id } });
        await tx.user.delete({ where: { id: existingUser.id } });
      }

      const user = await tx.user.create({
        data: {
          id: generatedUserId,
          email: payload.email,
          password: hashedPassword,
          role: Role.ADMIN,
        },
      });

      const admin = await tx.admin.create({
        data: {
          userId: user.id,
          name: payload.name,
          image: profileImage,
        },
      });

      return { user, admin };
    });

    let otpExpiry: Date | undefined;
    try {
      otpExpiry = await otpService.generate({
        userId: creationResult.user.id,
        to: creationResult.user.email,
      });
    } catch (otpErr) {
      await prisma.$transaction(async (tx) => {
        await tx.admin.delete({ where: { id: creationResult.admin.id } });
        await tx.user.delete({ where: { id: creationResult.user.id } });
      });
      throw otpErr;
    }

    return {
      user: {
        id: creationResult.user.id,
        email: creationResult.user.email,
        role: creationResult.user.role,
        name: creationResult.admin.name,
        image: creationResult.admin.image,
        status: creationResult.admin.status,
        otpExpiry: otpExpiry?.toISOString() ?? null,
      },
    };
  } catch (err) {
    if (uploadedImagePublicId) {
      try {
        await deleteCloudinaryAsset(uploadedImagePublicId);
      } catch (cleanupErr) {
        console.warn("Failed to cleanup uploaded admin image after tx failure", {
          uploadedImagePublicId,
          err: (cleanupErr as Error).message,
        });
      }
    }

    throw err;
  }
};

const login = async (payload: LoginInput): Promise<AuthResult> => {
  const user = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (!user) {
    throw new AppError(404, "User not found", [
      {
        field: "email",
        message: "No user corresponds to the provided email",
        code: "USER_NOT_FOUND",
      },
    ]);
  }

  const isPasswordValid = await bcrypt.compare(payload.password, user.password);

  if (!isPasswordValid) {
    throw new AppError(401, "Invalid password", [
      {
        field: "password",
        message: "The provided password is incorrect",
        code: "INVALID_PASSWORD",
      },
    ]);
  }

  if (!user.verified) {
    throw new AppError(403, "User is not verified yet", [
      {
        field: "verified",
        message: "Verify your account before logging in",
        code: "USER_NOT_VERIFIED",
      },
    ]);
  }

  const admin = await prisma.admin.findUnique({
    where: {
      userId: user.id,
    },
  });

  const customer = await prisma.customer.findUnique({
    where: {
      userId: user.id,
    },
  });

  if (!admin && !customer) {
    throw new AppError(404, "User profile not found", [
      {
        message: "The user does not have an admin or customer profile",
        code: "PROFILE_NOT_FOUND",
      },
    ]);
  }

  // Prevent login when the corresponding profile is not active
  if (admin && admin.status !== 'ACTIVE') {
    throw new AppError(403, 'Admin account not active', [
      { message: 'Admin account is not active', code: 'ADMIN_INACTIVE' }
    ]);
  }

  if (customer && customer.status !== 'ACTIVE') {
    throw new AppError(403, 'Customer account not active', [
      { message: 'Customer account is not active', code: 'CUSTOMER_INACTIVE' }
    ]);
  }

  const name = admin?.name || user.email.split("@")[0];
  const image = customer?.image ?? admin?.image ?? null;
  const status = admin ? admin.status : customer ? customer.status : null;

  const tokens = generateAuthTokens({
    id: user.id,
    email: user.email,
    name: name,
    role: user.role,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: name,
      phone: customer?.phone ?? null,
      image,
      status,
    },
    tokens,
  };
};

const refreshTokens = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({
    where: {
      id: payload.id,
    },
  });

  if (!user) {
    throw new AppError(401, "User not found", [
      {
        message: "No user corresponds to the provided refresh token",
        code: "USER_NOT_FOUND",
      },
    ]);
  }

  const admin = await prisma.admin.findUnique({
    where: {
      userId: user.id,
    },
  });

  const name = admin?.name ?? payload.name;

  return generateAuthTokens({
    id: user.id,
    email: user.email,
    name,
    role: user.role,
  });
};

const verifyOtp = async (payload: VerifyOtpInput): Promise<AuthResult> => {
  await otpService.verify({
    userId: payload.userId,
    code: payload.code,
    onVerified: async (tx) => {
      await tx.user.update({
        where: { id: payload.userId },
        data: { verified: true },
      });
    },
  });

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });

  if (!user) {
    throw new AppError(404, 'User not found', [
      { message: 'No user corresponds to the provided id', code: 'USER_NOT_FOUND' },
    ]);
  }

  const admin = await prisma.admin.findUnique({ where: { userId: user.id } });
  const customer = await prisma.customer.findUnique({ where: { userId: user.id } });

  const name = admin?.name || user.email.split('@')[0];
  const image = customer?.image ?? admin?.image ?? null;
  const status = admin ? admin.status : null;

  const tokens = generateAuthTokens({
    id: user.id,
    email: user.email,
    name,
    role: user.role,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name,
      phone: customer?.phone ?? null,
      image,
      status,
    },
    tokens,
  };
};

const sendOtp = async (payload: SendOtpInput): Promise<Date> => {
  const user = await prisma.user.findUnique({
    where: {
      id: payload.userId,
    },
  });

  if (!user) {
    throw new AppError(404, "User not found", [
      {
        message: "No user corresponds to the provided id",
        code: "USER_NOT_FOUND",
      },
    ]);
  }

  if (user.verified) {
    throw new AppError(400, "User already verified", [
      {
        message: "User is already verified",
        code: "USER_ALREADY_VERIFIED",
      },
    ]);
  }

  return otpService.generate({
    userId: user.id,
    to: user.email,
  });
};

const forgotPasswordSendOtp = async (payload: ForgotPasswordSendOtpInput) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!user) {
    throw new AppError(404, "User not found", [
      {
        field: "email",
        message: "No user corresponds to the provided email",
        code: "USER_NOT_FOUND",
      },
    ]);
  }

  const otpExpiry = await otpService.generate({
    userId: user.id,
    to: user.email,
  });

  return { userId: user.id, otpExpiry };
};

const forgotPasswordVerifyOtp = async (payload: ForgotPasswordVerifyOtpInput) => {
  await otpService.verify({
    userId: payload.userId,
    code: payload.code,
    consume: false, // Wait until they enter new password to consume
  });
};

const resetPassword = async (payload: ResetPasswordInput) => {
  // Verify and consume OTP in this final step
  await otpService.verify({
    userId: payload.userId,
    code: payload.code,
    consume: true,
  });

  const hashedPassword = await bcrypt.hash(payload.newPassword, 12);
  await prisma.user.update({
    where: { id: payload.userId },
    data: { password: hashedPassword },
  });
};

export const authService = {
  registerCustomer,
  createAdmin,
  login,
  refreshTokens,
  verifyOtp,
  sendOtp,
  forgotPasswordSendOtp,
  forgotPasswordVerifyOtp,
  resetPassword,
};

