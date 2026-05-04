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
        const playerId: string = session.metadata?.playerId ?? '';
        const chipsStr: string = session.metadata?.chips ?? '0';
        const sessionId: string = session.id ?? '';
        const amountTotal: number = session.amount_total ?? 0;
        const chips = parseInt(chipsStr, 10);

        if (paymentStatus === 'paid' && playerId && chips > 0 && sessionId) {
          const alreadyProcessed = await storage.hasProcessedCheckout(sessionId);
          if (!alreadyProcessed) {
            await storage.addChipsToPlayer(playerId, chips);
            await storage.recordChipPurchase(playerId, sessionId, chips, amountTotal);
            console.log(`[stripe] granted ${chips} chips to player ${playerId} (session ${sessionId})`);
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
