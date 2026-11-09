import { GetObjectCommand,PutObjectCommand,S3Client,HeadBucketCommand } from '@aws-sdk/client-s3';
import { getEnv } from './env';
import { BusinessRuleError } from './errors';

function storage() {
  const env = getEnv();
  if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) throw new BusinessRuleError('STORAGE_REQUIRED','Configure object storage before generating certificates');
  return { bucket: env.S3_BUCKET,client: new S3Client({ endpoint: env.S3_ENDPOINT,region: env.S3_REGION,forcePathStyle: true,credentials: { accessKeyId: env.S3_ACCESS_KEY_ID,secretAccessKey: env.S3_SECRET_ACCESS_KEY } }) };
}
export async function storeCertificate(key: string, bytes: Buffer) {
  const { client,bucket } = storage();
  await client.send(new PutObjectCommand({ Bucket: bucket,Key: key,Body: bytes,ContentType: 'application/pdf',IfNoneMatch: '*' }));
}
export async function readCertificate(key: string) {
  const { client,bucket } = storage();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket,Key: key }));
  if (!object.Body) throw new Error('Stored PDF is missing');
  return object.Body.transformToByteArray();
}
export async function checkStorage() {
  const { client,bucket } = storage();
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}