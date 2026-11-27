import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError, assertOwnCashSession } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { folioTotals, notifyReceptionStaff } from '@/server/reception';
import { isSamePaymentRequest } from '@/features/reception/domain';
import { convertToXaf } from '@/server/currency';

export const instant = false;

const paymentSchema = z.object({
  folioId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  paymentMethodId: z.string().min(1),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/),
  reference: z.string().trim().max(100).optional(),
  description: z.string().trim().min(2).max(200).optional(),
  idempotencyKey: z.string().min(16).max(100),
}).superRefine((value, context) => {
  const hasFolio = Boolean(value.folioId);
  const hasClient = Boolean(value.clientId);
  if (hasFolio === hasClient) {
    context.addIssue({ code: 'custom', message: 'Indiquez un folio ou un client, pas les deux.' });
  }
  if (hasClient && !value.description?.trim()) {
    context.addIssue({ code: 'custom', path: ['description'], message: 'Libellé obligatoire pour un paiement hors réservation.' });
  }
});

export async function POST(request: Request) {
  try {
    const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Montant ou informations de paiement invalides.' }, { status: 400 });
    const input = parsed.data;
    const scope = await authorizedScope('payments.collect');
    const configuration = await hotelConfiguration();
    const inputAmount = new Prisma.Decimal(input.amount);
    const priorPayment = await db.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        paymentMethod: { select: { name: true, code: true } },
        client: { select: { name: true } },
      },
    });
    if (priorPayment) {
      const sameRequest = isSamePaymentRequest({
        folioId: priorPayment.folioId,
        clientId: priorPayment.clientId,
        paymentMethodId: priorPayment.paymentMethodId,
        amount: priorPayment.amount.toFixed(2),
        inputAmount: priorPayment.inputAmount?.toFixed(2) ?? null,
        inputCurrency: priorPayment.inputCurrency,
        reference: priorPayment.reference,
        description: priorPayment.description,
        receivedBy: priorPayment.receivedBy,
      }, {
        folioId: input.folioId ?? null,
        clientId: input.clientId ?? null,
        paymentMethodId: input.paymentMethodId,
        amount: priorPayment.amount.toFixed(2),
        inputAmount: inputAmount.toFixed(2),
        inputCurrency: configuration.currency,
        reference: input.reference || null,
        description: input.description?.trim() || null,
        receivedBy: scope.userId,
      });
      if (!sameRequest) throw new AppError(409, 'Cette clé de paiement a déjà été utilisée pour une autre opération.');
      return NextResponse.json({
        payment: {
          id: priorPayment.id,
          amount: priorPayment.amount.toFixed(2),
          method: priorPayment.paymentMethod.name,
          reference: priorPayment.reference,
          description: priorPayment.description,
          createdAt: priorPayment.createdAt,
          clientName: priorPayment.client?.name ?? null,
          reservationReference: null,
        },
        duplicate: true,
      });
    }
    const amount = await convertToXaf(inputAmount, configuration.currency);
    if (!amount.gt(0)) return NextResponse.json({ error: 'Le montant doit être supérieur à zéro.' }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      if (input.folioId) {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM Folio WHERE id = ${input.folioId} FOR UPDATE
        `;
        if (!locked.length) throw new AppError(404, 'Folio introuvable.');
      }

      const duplicate = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: {
          paymentMethod: { select: { name: true, code: true } },
          client: { select: { name: true } },
        },
      });
      if (duplicate) {
        const sameRequest = isSamePaymentRequest({
          folioId: duplicate.folioId,
          clientId: duplicate.clientId,
          paymentMethodId: duplicate.paymentMethodId,
          amount: duplicate.amount.toFixed(2),
          inputAmount: duplicate.inputAmount?.toFixed(2) ?? null,
          inputCurrency: duplicate.inputCurrency,
          reference: duplicate.reference,
          description: duplicate.description,
          receivedBy: duplicate.receivedBy,
        }, {
          folioId: input.folioId ?? null,
          clientId: input.clientId ?? null,
          paymentMethodId: input.paymentMethodId,
          amount: amount.toFixed(2),
          inputAmount: inputAmount.toFixed(2),
          inputCurrency: configuration.currency,
          reference: input.reference || null,
          description: input.description?.trim() || null,
          receivedBy: scope.userId,
        });
        if (!sameRequest) throw new AppError(409, 'Cette clé de paiement a déjà été utilisée pour une autre opération.');
        return { payment: duplicate, duplicate: true, clientName: duplicate.client?.name ?? null, reservationReference: null as string | null };
      }

      const openSessions = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
        SELECT id, userId FROM CashSession
        WHERE userId = ${scope.userId}
          AND status = 'OPEN'
        FOR UPDATE
      `;
      const session = openSessions.length
        ? await tx.cashSession.findFirst({
          where: { id: openSessions[0].id, userId: scope.userId, status: 'OPEN' },
          select: { id: true, userId: true },
        })
        : null;
      if (!session) throw new AppError(409, 'Ouvrez votre session de caisse avant d’encaisser un paiement.');
      assertOwnCashSession(scope, session);

      const method = await tx.paymentMethod.findFirst({
        where: { id: input.paymentMethodId, active: true },
        select: { id: true },
      });
      if (!method) throw new AppError(400, 'Ce moyen de paiement n’est pas activé dans cet établissement.');

      if (input.folioId) {
        const folio = await tx.folio.findFirst({
          where: { id: input.folioId, OR: [{ status: 'OPEN' }, { status: 'CLOSED', invoice: { isNot: {} } }] },
          include: {
            lines: { select: { amount: true } },
            payments: { select: { amount: true } },
            reservation: { select: { createdBy: true, reference: true, client: { select: { name: true } } } },
          },
        });
        if (!folio) throw new AppError(409, 'Ce folio ne comporte pas de facture à encaisser.');
        const balance = folioTotals(folio).balance;
        if (amount.gt(balance)) throw new AppError(409, `Le montant dépasse le solde restant de ${balance.toFixed(2)}.`);

        const payment = await tx.payment.create({
          data: {
            folioId: input.folioId,
            cashSessionId: session.id,
            paymentMethodId: method.id,
            receivedBy: scope.userId,
            idempotencyKey: input.idempotencyKey,
            amount,
            inputAmount,
            inputCurrency: configuration.currency,
            reference: input.reference || null,
          },
          include: { paymentMethod: { select: { name: true, code: true } } },
        });
        await tx.auditLog.create({
          data: {
            actorId: scope.userId,
            action: 'RECEPTION_PAYMENT_COLLECT',
            result: 'SUCCESS',
            targetId: payment.id,
            details: {
              folioId: input.folioId,
              amount: amount.toFixed(2),
              inputAmount: inputAmount.toFixed(2),
              inputCurrency: configuration.currency,
              method: payment.paymentMethod.code,
            },
          },
        });
        await notifyReceptionStaff(
          tx,
          [folio.reservation?.createdBy],
          `Paiement de ${amount.toFixed(2)} (${payment.paymentMethod.name}) encaissé par ${scope.name} sur la réservation ${folio.reservation?.reference ?? input.folioId}.`,
          scope.userId,
        );
        return {
          payment,
          duplicate: false,
          clientName: folio.reservation?.client?.name ?? null,
          reservationReference: folio.reservation?.reference ?? null,
        };
      }

      const client = await tx.client.findFirst({
        where: { id: input.clientId },
        select: { id: true, name: true },
      });
      if (!client) throw new AppError(404, 'Client introuvable.');
      const description = input.description!.trim();

      const payment = await tx.payment.create({
        data: {
          clientId: client.id,
          cashSessionId: session.id,
          paymentMethodId: method.id,
          receivedBy: scope.userId,
          idempotencyKey: input.idempotencyKey,
          amount,
          inputAmount,
          inputCurrency: configuration.currency,
          description,
          reference: input.reference || null,
        },
        include: { paymentMethod: { select: { name: true, code: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_PAYMENT_DIRECT',
          result: 'SUCCESS',
          targetId: payment.id,
          details: {
            clientId: client.id,
            amount: amount.toFixed(2),
            inputAmount: inputAmount.toFixed(2),
            inputCurrency: configuration.currency,
            method: payment.paymentMethod.code,
            description,
          },
        },
      });
      await notifyReceptionStaff(
        tx,
        [],
        `Paiement direct de ${amount.toFixed(2)} (${payment.paymentMethod.name}) encaissé par ${scope.name} pour ${client.name} · ${description}.`,
        scope.userId,
      );
      return {
        payment,
        duplicate: false,
        clientName: client.name,
        reservationReference: null,
      };
    });

    return NextResponse.json({
      payment: {
        id: result.payment.id,
        amount: result.payment.amount.toFixed(2),
        method: result.payment.paymentMethod.name,
        reference: result.payment.reference,
        description: 'description' in result.payment ? result.payment.description ?? null : null,
        createdAt: result.payment.createdAt,
        clientName: result.clientName,
        reservationReference: result.reservationReference,
      },
      duplicate: result.duplicate,
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Ce paiement a déjà été enregistré.' }, { status: 409 });
    }
    throw error;
  }
}
