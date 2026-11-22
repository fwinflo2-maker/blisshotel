import { NextResponse } from 'next/server';
import { z } from 'zod';
import { platformFeatures } from '@/features/access/catalog';
import { db } from '@/server/db';
import { platformApi } from '@/server/platform-admin';

export async function GET() {
  return platformApi(async () => {
    const stored = await db.platformFeature.findMany();
    const storedByKey = new Map(stored.map((feature) => [feature.key, feature]));
    return NextResponse.json({
      features: platformFeatures.map((feature) => {
        const current = storedByKey.get(feature.key);
        return {
          ...feature,
          enabled: current?.enabled ?? true,
          updatedAt: current?.updatedAt ?? null,
        };
      }),
    });
  });
}

const updateSchema = z.object({ key: z.string().min(1).max(100), enabled: z.boolean() });

export async function PATCH(request: Request) {
  return platformApi(async (actor) => {
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Modification de fonctionnalité invalide.' }, { status: 400 });
    const feature = platformFeatures.find((item) => item.key === parsed.data.key);
    if (!feature) return NextResponse.json({ error: 'Fonctionnalité plateforme inconnue.' }, { status: 404 });

    const previous = await db.platformFeature.findUnique({ where: { key: feature.key } });
    if ((previous?.enabled ?? true) === parsed.data.enabled) {
      return NextResponse.json({ error: 'La fonctionnalité possède déjà cet état.' }, { status: 409 });
    }

    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.platformFeature.upsert({
        where: { key: feature.key },
        update: { enabled: parsed.data.enabled, updatedBy: actor.id },
        create: { key: feature.key, enabled: parsed.data.enabled, updatedBy: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: parsed.data.enabled ? 'PLATFORM_FEATURE_ENABLE' : 'PLATFORM_FEATURE_DISABLE',
          result: 'SUCCESS',
          targetId: feature.key,
          details: { name: feature.name, before: previous?.enabled ?? true, after: saved.enabled, scope: 'bliss_hotel' },
        },
      });
      return saved;
    });
    return NextResponse.json({ feature: { ...feature, enabled: updated.enabled, updatedAt: updated.updatedAt } });
  });
}
