import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export type UploadResult = {
  url: string;
  key: string;
};

const LOCAL_ROOT = path.resolve(process.cwd(), 'uploads');
const PUBLIC_PATH_PREFIX = '/uploads';

let s3Client: S3Client | null = null;

function getS3() {
  if (!process.env.S3_BUCKET) return null;
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  return s3Client;
}

function extFromMime(mimetype: string): string {
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/webp') return 'webp';
  if (mimetype === 'image/svg+xml') return 'svg';
  return 'jpg';
}

function buildKey(orgId: string, folder: string, mimetype: string) {
  return `${folder}/${orgId}/${randomUUID()}.${extFromMime(mimetype)}`;
}

export async function uploadImage(
  orgId: string,
  folder: 'ad-images' | 'logos',
  buffer: Buffer,
  mimetype: string,
): Promise<UploadResult> {
  const key = buildKey(orgId, folder, mimetype);
  const client = getS3();

  if (client && process.env.S3_BUCKET) {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );
    const base = process.env.S3_PUBLIC_URL_BASE?.replace(/\/$/, '');
    const url = base ? `${base}/${key}` : `${process.env.S3_ENDPOINT?.replace(/\/$/, '') ?? ''}/${process.env.S3_BUCKET}/${key}`;
    return { url, key };
  }

  // Local fallback for dev: write to backend/uploads/{folder}/{orgId}/{uuid}.{ext}
  const absDir = path.join(LOCAL_ROOT, folder, orgId);
  await mkdir(absDir, { recursive: true });
  const fileName = key.split('/').pop()!;
  const absPath = path.join(absDir, fileName);
  await writeFile(absPath, buffer);
  return { url: `${PUBLIC_PATH_PREFIX}/${key}`, key };
}

export async function deleteImage(key: string): Promise<void> {
  const client = getS3();
  if (client && process.env.S3_BUCKET) {
    await client.send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
      }),
    );
    return;
  }
  const absPath = path.join(LOCAL_ROOT, key);
  try {
    await unlink(absPath);
  } catch {
    // ignore: object may have been removed already
  }
}

export async function fetchImageBuffer(keyOrUrl: string): Promise<Buffer> {
  const client = getS3();
  if (client && process.env.S3_BUCKET && !keyOrUrl.startsWith('http') && !keyOrUrl.startsWith('/uploads')) {
    const response = await client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: keyOrUrl }),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  if (keyOrUrl.startsWith('/uploads/')) {
    const relative = keyOrUrl.replace(/^\/uploads\//, '');
    return readFile(path.join(LOCAL_ROOT, relative));
  }

  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    const res = await fetch(keyOrUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const arr = new Uint8Array(await res.arrayBuffer());
    return Buffer.from(arr);
  }

  // treat as local filesystem path
  return readFile(path.join(LOCAL_ROOT, keyOrUrl));
}

export const LOCAL_UPLOADS_ROOT = LOCAL_ROOT;
export const UPLOADS_PUBLIC_PREFIX = PUBLIC_PATH_PREFIX;
