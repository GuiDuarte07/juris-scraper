import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { UserRole } from 'src/Entities/User.entity';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Login de usuário',
  })
  @ApiBody({
    description: 'Credenciais de login',
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
        },
        password: {
          type: 'string',
          example: 'senha123',
        },
      },
      required: ['email', 'password'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login realizado com sucesso',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 1,
          email: 'user@example.com',
          role: 'admin',
        },
      },
    },
  })
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!email || !password) {
      throw new BadRequestException('Email e senha são obrigatórios');
    }

    const result = await this.authService.login(email, password);

    // Definir cookie com o token
    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
    });

    return result;
  }

  @Post('create-user')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Criar novo usuário (apenas admin)',
  })
  @ApiBody({
    description: 'Dados do novo usuário',
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'newuser@example.com',
        },
        password: {
          type: 'string',
          example: 'senha123',
        },
        role: {
          type: 'string',
          enum: ['admin', 'user'],
          example: 'user',
        },
      },
      required: ['email', 'password'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Usuário criado com sucesso',
    schema: {
      example: {
        id: 2,
        email: 'newuser@example.com',
        role: 'user',
      },
    },
  })
  async createUser(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('role') role: UserRole = UserRole.USER,
  ) {
    if (!email || !password) {
      throw new BadRequestException('Email e senha são obrigatórios');
    }

    if (role && !Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Role inválido. Use: admin ou user');
    }

    return await this.authService.createUser(email, password, role);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Logout do usuário',
  })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return { message: 'Logout realizado com sucesso' };
  }
}
