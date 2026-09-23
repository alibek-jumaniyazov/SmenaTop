import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { connect } from 'node:net';

@Injectable()
export class StorageService {
  readonly provider = process.env.STORAGE_PROVIDER ?? 'local';
  private readonly root = resolve(process.env.STORAGE_LOCAL_PATH ?? '.local/private-files');
  private readonly client =
    this.provider === 's3'
      ? new S3Client({
          region: process.env.S3_REGION ?? 'us-east-1',
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: true,
          ...(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
            ? {
                credentials: {
                  accessKeyId: process.env.S3_ACCESS_KEY,
                  secretAccessKey: process.env.S3_SECRET_KEY,
                },
              }
            : {}),
        })
      : null;
  constructor() {
    if (
      process.env.APP_ENV === 'production' &&
      (this.provider !== 's3' || !process.env.CLAMAV_HOST)
    )
      throw new Error('Production private storage requires S3 and ClamAV configuration');
  }
  private path(key: string) {
    const path = resolve(this.root, key);
    const subpath = relative(this.root, path);
    if (isAbsolute(subpath) || subpath.startsWith('..') || !subpath)
      throw new Error('Invalid storage key');
    return path;
  }
  async put(key: string, data: Buffer, mimeType: string) {
    if (this.client)
      await this.client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: data,
          ContentType: mimeType,
          ServerSideEncryption:
            process.env.S3_SERVER_SIDE_ENCRYPTION === 'AES256' ? 'AES256' : undefined,
        }),
      );
    else {
      await mkdir(this.root, { recursive: true });
      await writeFile(this.path(key), data, { flag: 'wx', mode: 0o600 });
    }
  }
  async get(key: string) {
    if (!this.client) return readFile(this.path(key));
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    if (!result.Body) throw new ServiceUnavailableException('Private object unavailable');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async remove(key: string) {
    if (this.client)
      await this.client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    else await unlink(this.path(key)).catch(() => undefined);
  }
  async scan(buffer: Buffer): Promise<'CLEAN' | 'REJECTED' | 'QUARANTINED'> {
    if (!process.env.CLAMAV_HOST) return 'QUARANTINED';
    return new Promise((resolveScan, reject) => {
      const socket = connect({
        host: process.env.CLAMAV_HOST,
        port: Number(process.env.CLAMAV_PORT ?? 3310),
      });
      let response = '';
      socket.setTimeout(15_000, () => {
        socket.destroy();
        reject(new ServiceUnavailableException('Document scanner timeout'));
      });
      socket.on('error', () =>
        reject(new ServiceUnavailableException('Document scanner unavailable')),
      );
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < buffer.length; offset += 65536) {
          const chunk = buffer.subarray(offset, offset + 65536);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (chunk) => {
        response += chunk.toString();
        if (response.length > 4096) socket.destroy(new Error('Scanner response too large'));
      });
      socket.on('end', () => {
        if (response.replaceAll(String.fromCharCode(0), '').trim() === 'stream: OK')
          resolveScan('CLEAN');
        else if (response.includes('FOUND')) resolveScan('REJECTED');
        else reject(new ServiceUnavailableException('Document scanner failed'));
      });
    });
  }
}
