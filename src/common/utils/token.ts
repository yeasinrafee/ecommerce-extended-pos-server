import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

export type AuthTokenPayload = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const signToken = (
  payload: AuthTokenPayload,
  secret: string,
  expiresIn: string
): string => {
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as SignOptions['expiresIn']
  });
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export const generateAuthTokens = (payload: AuthTokenPayload): AuthTokens => {
  const accessToken = signToken(payload, env.jwtAccessSecret, env.jwtAccessExpires);
  const refreshToken = signToken(payload, env.jwtRefreshSecret, env.jwtRefreshExpires);

  return {
    accessToken,
    refreshToken
  };
};

const verifyToken = (token: string, secret: string, label: string): AuthTokenPayload => {
  try {
    const decoded = jwt.verify(token, secret);

    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error(`${label} payload is invalid`);
    }

    return decoded as AuthTokenPayload;
  } catch (error) {
    throw new AppError(401, `Invalid ${label}`, [
      {
        message: (error as Error).message,
        code: 'INVALID_TOKEN'
      }
    ]);
  }
};

export const verifyAccessToken = (token: string): AuthTokenPayload =>
  verifyToken(token, env.jwtAccessSecret, 'access token');

export const verifyRefreshToken = (token: string): AuthTokenPayload =>
  verifyToken(token, env.jwtRefreshSecret, 'refresh token');
