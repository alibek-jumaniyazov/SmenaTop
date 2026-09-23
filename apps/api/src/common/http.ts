import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { map } from 'rxjs/operators';
import type { AuthRequest } from '../auth/current-user';
export const serialize = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key: string, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  ) as unknown;
@Injectable()
export class JsonInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((value) => serialize(value)));
  }
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<AuthRequest>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Kutilmagan xatolik yuz berdi';
    let fieldErrors: unknown = {};
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object') {
        const object = response as Record<string, unknown>;
        message = typeof object.message === 'string' ? object.message : exception.message;
        code = typeof object.code === 'string' ? object.code : `HTTP_${status}`;
        fieldErrors = object.fieldErrors ?? {};
      } else {
        message = response;
        code = `HTTP_${status}`;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Ma’lumot topilmadi';
      } else if (['P2002', 'P2003', 'P2004', 'P2010', 'P2034'].includes(exception.code)) {
        status = 409;
        code = 'DATA_CONFLICT';
        message = 'Amal boshqa yozuv yoki holat bilan to‘qnashdi';
      }
    }
    if (status === 500)
      process.stderr.write(
        JSON.stringify({
          level: 'error',
          requestId: req.requestId,
          type: exception instanceof Error ? exception.name : 'unknown',
        }) + '\n',
      );
    res.status(status).json({ code, message, fieldErrors, requestId: req.requestId });
  }
}
