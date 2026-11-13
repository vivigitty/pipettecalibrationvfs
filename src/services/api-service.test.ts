import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { Actor } from '@/lib/rbac';

const { saveLot,certificateLoad } = vi.hoisted(() => ({ saveLot: vi.fn(),certificateLoad: vi.fn() }));
vi.mock('./calibration-service', () => ({ saveLot,startSession: vi.fn(),completeSession: vi.fn(),createDamage: vi.fn(),getSession: vi.fn() }));
vi.mock('./inventory-service', () => ({ createResource: vi.fn(),getAsset: vi.fn(),getLabConditions: vi.fn(),listResources: vi.fn() }));
vi.mock('./preview-service', () => ({ derivePreview: vi.fn() }));
vi.mock('./maintenance-service', () => ({ updateLimits: vi.fn(),updateUser: vi.fn() }));
vi.mock('./certificate-service', () => {
  certificateLoad();
  throw new Error('PDFKit font unavailable');
});

import { readApi,writeApi } from './api-service';

const sessionId = '00000000-0000-4000-8000-000000000200';
const requestId = '00000000-0000-4000-8000-000000000201';
const actor: Actor = { id: '00000000-0000-4000-8000-000000000001',displayName: 'Technician',role: 'technician',isPreview: false };

describe('Certificate rendering isolation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('saves lot readings without loading a broken PDF renderer', async () => {
    const readings = { masses: Array<string>(10).fill('0.002') };
    const saved = { lots: [{ lotNo: 1 }] };
    saveLot.mockResolvedValue(saved);

    expect(await writeApi(actor,'PATCH',['sessions',sessionId,'lots','1'],readings,requestId)).toBe(saved);
    expect(saveLot).toHaveBeenCalledWith(actor,sessionId,1,readings,requestId);
    expect(certificateLoad).not.toHaveBeenCalled();
  });

  it('surfaces PDF loading errors only when a certificate is requested', async () => {
    await expect(readApi(actor,['sessions',sessionId,'certificate-download'],{})).rejects.toThrow();
    expect(certificateLoad).toHaveBeenCalledOnce();
  });
});
