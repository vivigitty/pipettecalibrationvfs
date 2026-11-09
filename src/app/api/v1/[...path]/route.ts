import { randomUUID } from 'node:crypto';
import { problem,serialize } from '@/lib/http';
import { currentActor } from '@/lib/rbac';
import { protectMutation,readJson } from '@/lib/request';
import { readApi,writeApi } from '@/services/api-service';

export const runtime = 'nodejs';
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const requestId = randomUUID();
  try {
    const actor = await currentActor();
    const { path } = await context.params;
    const result = request.method==='GET'
      ? await readApi(actor,path,Object.fromEntries(new URL(request.url).searchParams))
      : await mutation(request,actor,path,requestId);
    if (result instanceof Response) return result;
    return Response.json(serialize(result), { status: request.method==='POST' ? 201 : 200,headers: { 'Cache-Control': 'private, no-store','X-Request-ID': requestId } });
  } catch (error) { return problem(error,requestId); }
}

async function mutation(request: Request, actor: Awaited<ReturnType<typeof currentActor>>, path: string[], requestId: string) {
  protectMutation(request,actor.id);
  return writeApi(actor,request.method,path,await readJson(request),requestId,request.headers.get('idempotency-key') ?? '');
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;