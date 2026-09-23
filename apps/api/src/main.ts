import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { validateEnvironment } from './common/config';
import { ApiExceptionFilter, JsonInterceptor } from './common/http';
import { documentContracts } from './common/openapi';
export async function bootstrap() {
  const environment = validateEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  const origins = (
    environment.CORS_ORIGINS ??
    environment.WEB_ORIGIN ??
    'http://localhost:5173'
  ).split(',');
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'X-Dev-Key', 'X-Api-Key'],
  });
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '256kb', type: ['application/json', 'text/json'] });
  app.useBodyParser('urlencoded', { extended: false, limit: '256kb' });
  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/v1/payments/payme' && error instanceof SyntaxError) {
      res.status(200).json({
        id: null,
        error: {
          code: -32700,
          message: { uz: 'JSON xatosi', ru: 'Ошибка JSON', en: 'Parse error' },
        },
      });
      return;
    }
    next(error);
  });
  app.use((req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('x-request-id', req.requestId);
    const origin = req.header('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !origins.includes(origin)) {
      res.status(403).json({
        code: 'ORIGIN_FORBIDDEN',
        message: 'Origin not allowed',
        fieldErrors: {},
        requestId: req.requestId,
      });
      return;
    }
    next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new JsonInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );
  if (environment.APP_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SmenaTop API')
      .setDescription(
        'Versioned SmenaTop domain API. All browser mutations require a current session and X-CSRF-Token. Money amounts are decimal strings in tiyin.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('smenatop_session')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'organization-key')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    documentContracts(document);
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
    if (process.env.OPENAPI_OUTPUT)
      writeFileSync(process.env.OPENAPI_OUTPUT, JSON.stringify(document, null, 2));
  }
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
  return app;
}
if (require.main === module) void bootstrap();
