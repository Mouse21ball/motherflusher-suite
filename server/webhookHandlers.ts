import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Custom business logic: grant chips on successful payment.
    // Signature already verified above by sync.processWebhook — safe to parse.
    try {
      const event = JSON.parse(payload.toString()) as {
        type: string;
        data: { object: Record<string, any> };
      };

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const paymentStatus: string = session.payment_status ?? '';
        const sessionId: string = session.id ?? '';
        const amountTotal: number = session.amount_total ?? 0;

        // Support both new metadata keys (userId/chipAmount) and legacy keys (playerId/chips)
        // for backward compatibility with any sessions created before this update.
        const userId: string =
          session.metadata?.userId ?? session.metadata?.playerId ?? '';
        const chipAmountStr: string =
          session.metadata?.chipAmount ?? session.metadata?.chips ?? '0';
        const chipAmount = parseInt(chipAmountStr, 10);

        if (paymentStatus === 'paid' && userId && chipAmount > 0 && sessionId) {
          const alreadyProcessed = await storage.hasProcessedCheckout(sessionId);
          if (!alreadyProcessed) {
            await storage.addChipsToPlayer(userId, chipAmount);
            await storage.recordChipPurchase(userId, sessionId, chipAmount, amountTotal);
            console.log(`[stripe] granted ${chipAmount} chips to user ${userId} (session ${sessionId})`);
          } else {
            console.log(`[stripe] checkout ${sessionId} already processed — skipping`);
          }
        }
      }
    } catch (err: any) {
      console.error('[stripe] custom webhook handler error:', err.message);
    }
  }
}
