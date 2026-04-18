import { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendResponse } from '../../common/utils/send-response.js';
import { normalizeUploadedFiles } from '../../common/utils/file-upload.js';
import { setAuthCookies, clearAuthCookies } from '../../common/utils/cookie.js';
import { authService } from './auth.service.js';
import { prisma } from '../../config/prisma.js';
import {
	validateCreateAdminPayload,
	validateLoginPayload,
	validateVerifyOtpPayload,
	validateSendOtpPayload,
	validateForgotPasswordSendOtpPayload,
	validateForgotPasswordVerifyOtpPayload,
	validateResetPasswordPayload,
	validateRegisterCustomerPayload,
} from './auth.types.js';

const registerCustomer = async (req: Request, res: Response) => {
	const payload = validateRegisterCustomerPayload(req.body);

	const result = await authService.registerCustomer(payload);

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Registration successful. Please verify your OTP.',
		data: result,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const createAdmin = async (req: Request, res: Response) => {
	const payload = validateCreateAdminPayload(req.body);
	const files = normalizeUploadedFiles(req.files);

	const result = await authService.createAdmin(payload, files);

	sendResponse({
		res,
		statusCode: 201,
		success: true,
		message: 'Admin created successfully',
		data: result.user,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const login = async (req: Request, res: Response) => {
	const payload = validateLoginPayload(req.body);

	const result = await authService.login(payload);

	setAuthCookies(res, result.tokens);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Logged in successfully',
		data: result.user,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const refreshToken = async (req: Request, res: Response) => {
	const token = typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken.trim() : '';

	if (!token) {
		throw new AppError(400, 'Refresh token is required', [
			{
				message: 'Provide a valid refreshToken cookie',
				code: 'REFRESH_TOKEN_REQUIRED'
			}
		]);
	}

	const tokens = await authService.refreshTokens(token);

	setAuthCookies(res, tokens);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Tokens refreshed successfully',
		data: null,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const logout = async (_req: Request, res: Response) => {
	clearAuthCookies(res);
	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Logged out successfully',
		data: null,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const verifyOtp = async (req: Request, res: Response) => {
	const payload = validateVerifyOtpPayload(req.body);
	const result = await authService.verifyOtp(payload);

	setAuthCookies(res, result.tokens);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'OTP verified successfully',
		data: result.user,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const sendOtp = async (req: Request, res: Response) => {
	const payload = validateSendOtpPayload(req.body);
	const expiry = await authService.sendOtp(payload);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'OTP sent successfully',
		data: { otpExpiry: expiry?.toISOString() ?? null },
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const forgotPasswordSendOtp = async (req: Request, res: Response) => {
	const payload = validateForgotPasswordSendOtpPayload(req.body);
	const data = await authService.forgotPasswordSendOtp(payload);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Reset OTP sent to your email. Please check your inbox.',
		data: {
			userId: data.userId,
			otpExpiry: data.otpExpiry?.toISOString() ?? null
		},
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const forgotPasswordVerifyOtp = async (req: Request, res: Response) => {
	const payload = validateForgotPasswordVerifyOtpPayload(req.body);
	await authService.forgotPasswordVerifyOtp(payload);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'OTP verified successfully',
		data: null,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const resetPassword = async (req: Request, res: Response) => {
	const payload = validateResetPasswordPayload(req.body);
	await authService.resetPassword(payload);

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Password reset successfully',
		data: null,
		errors: [],
		meta: {
			timestamp: new Date().toISOString()
		}
	});
};

const getCustomerMe = async (req: Request, res: Response) => {
	const userId = req.user?.id;
 	if (!userId) {
 		throw new AppError(401, 'Unauthorized');
 	}

	const userRecord = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			email: true,
			role: true,
			verified: true,
			createdAt: true,
			updatedAt: true
		}
	});

	if (!userRecord) {
		throw new AppError(404, 'User not found');
	}

	const customer = await prisma.customer.findUnique({
		where: { userId },
		include: {
			addresses: {
				where: {
					deletedAt: null
				}
			}
		}
	});
	const admin = await prisma.admin.findUnique({ where: { userId } });

	const name = admin?.name || userRecord.email.split('@')[0];
	const image = customer?.image ?? admin?.image ?? null;
	const status = admin ? admin.status : customer ? customer.status : null;

	const payload = {
		id: userRecord.id,
		email: userRecord.email,
		role: userRecord.role,
		name,
		phone: customer?.phone ?? null,
		image,
		status,
		user: userRecord,
		customer: customer ?? null
	};

	sendResponse({
		res,
		statusCode: 200,
		success: true,
		message: 'Customer retrieved',
		data: payload,
		errors: [],
		meta: { timestamp: new Date().toISOString() }
	});
};

export const authController = {
	registerCustomer,
	createAdmin,
	login,
	refreshToken,
	logout,
	verifyOtp,
	sendOtp,
	forgotPasswordSendOtp,
	forgotPasswordVerifyOtp,
	resetPassword
	 ,getCustomerMe
};
