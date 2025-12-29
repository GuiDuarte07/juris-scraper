import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserEntity, UserRole } from 'src/Entities/User.entity';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Inicializa o usuário admin padrão na primeira execução
   */
  async onModuleInit() {
    await this.initializeDefaultAdmin();
  }

  /**
   * Cria o usuário admin padrão se não existir
   */
  private async initializeDefaultAdmin() {
    const adminEmail = 'guilhduart.abr@gmail.com';
    const adminPassword = this.configService.get<string>(
      'DEFAULT_ADMIN_PASSWORD',
    );

    if (!adminPassword) {
      console.error('DEFAULT_ADMIN_PASSWORD não está configurado no .env');
      return;
    }

    const existingAdmin = await this.userRepository.findOne({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const admin = this.userRepository.create({
        email: adminEmail,
        password: hashedPassword,
        role: UserRole.ADMIN,
      });

      await this.userRepository.save(admin);
      console.log(`✓ Usuário admin padrão criado: ${adminEmail}`);
    }
  }

  /**
   * Faz login do usuário
   */
  async login(
    email: string,
    password: string,
  ): Promise<{
    access_token: string;
    user: { id: number; email: string; role: UserRole };
  }> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const isPasswordValid = await this.validatePassword(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Cria um novo usuário (apenas admin pode fazer isso)
   */
  async createUser(
    email: string,
    password: string,
    role: UserRole = UserRole.USER,
  ): Promise<{ id: number; email: string; role: UserRole }> {
    // Validar email
    if (!email || !password) {
      throw new BadRequestException('Email e senha são obrigatórios');
    }

    // Verificar se usuário já existe
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Este email já está registrado');
    }

    // Hash da senha
    const hashedPassword = await this.hashPassword(password);

    // Criar novo usuário
    const newUser = this.userRepository.create({
      email,
      password: hashedPassword,
      role,
    });

    const savedUser = await this.userRepository.save(newUser);

    return {
      id: savedUser.id,
      email: savedUser.email,
      role: savedUser.role,
    };
  }

  /**
   * Hash de senha
   */
  private async hashPassword(password: string): Promise<string> {
    const hashedPassword = await bcrypt.hash(password, 10);
    return hashedPassword;
  }

  /**
   * Valida senha
   */
  private async validatePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    const isValid = await bcrypt.compare(password, hashedPassword);
    return isValid;
  }

  /**
   * Valida um token JWT
   */
  verifyToken(token: string) {
    try {
      const decoded = this.jwtService.verify(token);
      return decoded;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
