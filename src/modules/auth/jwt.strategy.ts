import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          console.log('Bearer?', req.headers.authorization);
          console.log('Cookie token?', req.cookies?.access_token);

          // Tenta extrair do Bearer token no header
          const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
          if (bearerToken) {
            return bearerToken;
          }

          // Fallback para cookies
          if (req.cookies && req.cookies.access_token) {
            return req.cookies.access_token;
          }

          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
