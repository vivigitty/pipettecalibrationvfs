import { z } from 'zod';
import { NotFoundError } from '@/lib/errors';
import type { Actor } from '@/lib/rbac';
import { idSchema,resourceSchema } from '@/schemas/resources';
import { completeSession,createDamage,getSession,saveLot,startSession } from './calibration-service';
import { downloadCertificate,generateCertificate,voidCertificate } from './certificate-service';
import { createResource,getAsset,listResources } from './inventory-service';
import { derivePreview } from './preview-service';
import { updateLimits,updateUser } from './maintenance-service';

export async function readApi(actor: Actor, parts: string[], query: unknown) {
  const [resource,id] = parts;
  if (parts.length===1 && resource && ['range-plan','dates','z-factor'].includes(resource)) return derivePreview(actor,resource,query);
  if (parts.length===1) return listResources(actor,resourceSchema.parse(resource),query);
  if (resource==='assets' && id && parts.length===2) return getAsset(actor,idSchema.parse(id));
  if (resource==='sessions' && id && parts.length===2) return getSession(actor,idSchema.parse(id));
  if (resource==='certificates' && id && parts.length===2) return downloadCertificate(actor,idSchema.parse(id));
  throw new NotFoundError('Endpoint not found');
}

export async function writeApi(actor: Actor, method: string, parts: string[], raw: unknown, requestId: string, idempotencyKey: string) {
  const [resource,id,action,lot] = parts;
  if (method==='POST' && parts.length===1) return createResource(actor,resourceSchema.parse(resource),raw,requestId);
  const resourceId = idSchema.parse(id);
  if (method==='PATCH' && resource==='users' && parts.length===2) return updateUser(actor,resourceId,raw,requestId);
  if (method==='PATCH' && resource==='ranges' && action==='limits' && parts.length===3) return updateLimits(actor,resourceId,raw,requestId);
  if (method==='POST' && resource==='assets' && action==='sessions' && parts.length===3) return startSession(actor,resourceId,raw,requestId);
  if (method==='POST' && resource==='assets' && action==='damages' && parts.length===3) return createDamage(actor,resourceId,raw,requestId);
  if (method==='POST' && resource==='sessions' && action==='complete' && parts.length===3) return completeSession(actor,resourceId,requestId);
  if (method==='POST' && resource==='sessions' && action==='certificates' && parts.length===3) return generateCertificate(actor,resourceId,idempotencyKey,requestId);
  if (method==='POST' && resource==='certificates' && action==='void' && parts.length===3) return voidCertificate(actor,resourceId,raw,requestId);
  if (method==='PATCH' && resource==='sessions' && action==='lots' && parts.length===4) return saveLot(actor,resourceId,z.coerce.number().int().min(1).max(36).parse(lot),raw,requestId);
  throw new NotFoundError('Endpoint not found');
}