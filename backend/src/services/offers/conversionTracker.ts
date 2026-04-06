/**
 * Offer Conversion Tracker
 *
 * Tracks offer-driven bookings through 3 attribution methods:
 * 1. Explicit promo code (highest confidence)
 * 2. Campaign target attribution (within 72h of contact)
 * 3. Booking link with offer parameter
 */
import { PrismaClient } from '@prisma/client';

const ATTRIBUTION_WINDOW_HOURS = 72;

export class OfferConversionTracker {
  constructor(private prisma: PrismaClient) {}

  /**
   * Track a redemption when a patient explicitly uses a promo code.
   */
  async trackRedemption(params: {
    offerId: string;
    patientId: string;
    appointmentId?: string;
    campaignTargetId?: string;
    channel?: string;
    promoCode?: string;
    originalPrice?: number;
    discountAmount?: number;
    finalPrice?: number;
  }) {
    const redemption = await this.prisma.offerRedemption.create({
      data: {
        offerId: params.offerId,
        patientId: params.patientId,
        appointmentId: params.appointmentId,
        campaignTargetId: params.campaignTargetId,
        channel: params.channel,
        promoCodeUsed: params.promoCode,
        originalPrice: params.originalPrice,
        discountAmount: params.discountAmount,
        finalPrice: params.finalPrice,
        status: 'pending',
      },
    });

    // Update offer counters
    await this.updateOfferCounters(params.offerId);

    // Mark campaign target as redeemed if applicable
    if (params.campaignTargetId) {
      await this.prisma.campaignTarget.update({
        where: { targetId: params.campaignTargetId },
        data: { offerRedeemed: true, status: 'booked' },
      });
    }

    return redemption;
  }

  /**
   * Called after a booking to check if it can be attributed to an offer.
   * Uses campaign target attribution (72h window).
   */
  async attributeBookingToOffer(appointmentId: string): Promise<{ attributed: boolean; offerId?: string }> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { appointmentId },
    });
    if (!appointment || !appointment.patientId) return { attributed: false };

    // 1. Check if appointment already has a promo code
    if (appointment.promoCode) {
      const offer = await this.prisma.offer.findUnique({
        where: { promoCode: appointment.promoCode },
      });
      if (offer && offer.status === 'active') {
        await this.trackRedemption({
          offerId: offer.offerId,
          patientId: appointment.patientId,
          appointmentId,
          channel: appointment.bookedVia,
          promoCode: appointment.promoCode,
        });
        return { attributed: true, offerId: offer.offerId };
      }
    }

    // 2. Check if patient was a campaign target for a promotional campaign within 72h
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - ATTRIBUTION_WINDOW_HOURS);

    const recentTarget = await this.prisma.campaignTarget.findFirst({
      where: {
        patientId: appointment.patientId,
        campaign: {
          type: 'promotional',
          offerId: { not: null },
        },
        updatedAt: { gte: cutoff },
        status: { in: ['reached', 'pending', 'calling'] },
      },
      include: {
        campaign: { select: { offerId: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (recentTarget && recentTarget.campaign.offerId) {
      await this.trackRedemption({
        offerId: recentTarget.campaign.offerId,
        patientId: appointment.patientId,
        appointmentId,
        campaignTargetId: recentTarget.targetId,
        channel: appointment.bookedVia,
      });
      return { attributed: true, offerId: recentTarget.campaign.offerId };
    }

    return { attributed: false };
  }

  /**
   * Update an offer's denormalized counters.
   */
  async updateOfferCounters(offerId: string) {
    const [redemptionCount, revenueResult] = await Promise.all([
      this.prisma.offerRedemption.count({
        where: { offerId, status: { not: 'cancelled' } },
      }),
      this.prisma.offerRedemption.aggregate({
        where: { offerId, status: 'completed' },
        _sum: { finalPrice: true },
      }),
    ]);

    await this.prisma.offer.update({
      where: { offerId },
      data: {
        totalRedeemed: redemptionCount,
        totalRevenue: revenueResult._sum.finalPrice || 0,
      },
    });
  }

  /**
   * Update redemption status when appointment status changes.
   */
  async updateRedemptionStatus(appointmentId: string, newStatus: string) {
    const statusMap: Record<string, string> = {
      confirmed: 'confirmed',
      completed: 'completed',
      cancelled: 'cancelled',
      no_show: 'cancelled',
    };

    const redemptionStatus = statusMap[newStatus];
    if (!redemptionStatus) return;

    const redemption = await this.prisma.offerRedemption.findFirst({
      where: { appointmentId },
    });
    if (!redemption) return;

    await this.prisma.offerRedemption.update({
      where: { redemptionId: redemption.redemptionId },
      data: { status: redemptionStatus },
    });

    await this.updateOfferCounters(redemption.offerId);
  }
}
