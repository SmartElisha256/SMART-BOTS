/**
 * Side-effects after payment decisions (customer WhatsApp + conversion mark).
 * Imported by routes/admin and can be called after APPROVE/REJECT from WhatsApp.
 */
import { notifyCustomerPaymentApproved, notifyCustomerPaymentRejected } from './customerNotifyService.js';
import { markConverted } from './conversionService.js';
import { getPaymentRequestByReference } from './manualPaymentService.js';

export async function afterPaymentApproved(paymentReference) {
  const payment = await getPaymentRequestByReference(paymentReference);
  if (!payment) return;
  await markConverted(payment.phone);
  await notifyCustomerPaymentApproved({
    phone: payment.phone,
    durationDays: payment.durationDays,
    reference: payment.id
  });
}

export async function afterPaymentRejected(paymentReference) {
  const payment = await getPaymentRequestByReference(paymentReference);
  if (!payment) return;
  await notifyCustomerPaymentRejected({
    phone: payment.phone,
    reference: payment.id
  });
}
