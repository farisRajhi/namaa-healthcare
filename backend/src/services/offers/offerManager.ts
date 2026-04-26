/**
 * Offer Management Service
 *
 * Full lifecycle for WhatsApp marketing offers: create → activate → track → expire.
 * When an offer is activated, it auto-creates a promotional Campaign using the
 * existing campaign infrastructure for targeting (delivery is via Baileys WhatsApp
 * `/api/baileys-whatsapp/send`).
 */
import { PrismaClient } from '@prisma/client';
import { CampaignManager, PatientFilter } from '../campaigns/campaignManager.js';
import { MarketingConsentService } from '../compliance/marketingConsent.js';
import { TARGETING_PRESETS } from '../campaigns/targetingPresets.js';
import type { TargetPresetInfo } from '../campaigns/targetingPresets.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfferCreateInput {
  orgId: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  offerType: 'percentage_discount' | 'fixed_discount' | 'free_addon' | 'bundle' | 'loyalty_reward';
  discountValue?: number;
  discountUnit?: 'percent' | 'sar';
  promoCode?: string;
  serviceIds?: string[];
  providerIds?: string[];
  facilityIds?: string[];
  validFrom: Date;
  validUntil: Date;
  maxRedemptions?: number;
  perPatientLimit?: number;
  targetPreset?: string;
  targetFilter?: PatientFilter;
  messageAr?: string;
  messageEn?: string;
}

export interface OfferAnalytics {
  offerId: string;
  name: string;
  status: string;
  totalSent: number;
  totalRedeemed: number;
  totalRevenue: number;
  redemptionRate: number;
  averageDiscount: number;
  averageRevenue: number;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Offer Manager
// ---------------------------------------------------------------------------

export class OfferManager {
  constructor(private prisma: PrismaClient) {}

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  async createOffer(input: OfferCreateInput) {
    const promoCode = input.promoCode || await this.generatePromoCode(input.orgId);

    return this.prisma.offer.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        nameAr: input.nameAr,
        description: input.description,
        descriptionAr: input.descriptionAr,
        offerType: input.offerType,
        discountValue: input.discountValue,
        discountUnit: input.discountUnit,
        promoCode,
        serviceIds: input.serviceIds ?? [],
        providerIds: input.providerIds ?? [],
        facilityIds: input.facilityIds ?? [],
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        maxRedemptions: input.maxRedemptions,
        perPatientLimit: input.perPatientLimit ?? 1,
        targetPreset: input.targetPreset,
        targetFilter: (input.targetFilter ?? {}) as any,
        status: 'draft',
        messageAr: input.messageAr,
        messageEn: input.messageEn,
      },
    });
  }

  async getOffer(offerId: string) {
    return this.prisma.offer.findUnique({
      where: { offerId },
      include: {
        campaigns: { select: { campaignId: true, status: true, name: true } },
        _count: { select: { redemptions: true } },
      },
    });
  }

  async listOffers(
    orgId: string,
    options?: { status?: string; type?: string; page?: number; limit?: number },
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { orgId };
    if (options?.status) where.status = options.status;
    if (options?.type) where.offerType = options.type;

    const [offers, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { redemptions: true } } },
      }),
      this.prisma.offer.count({ where }),
    ]);

    return {
      data: offers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateOffer(offerId: string, data: Partial<OfferCreateInput>) {
    const offer = await this.prisma.offer.findUnique({ where: { offerId } });
    if (!offer) throw new Error('Offer not found');
    if (!['draft', 'paused'].includes(offer.status)) {
      throw new Error('Can only update offers in draft or paused status');
    }

    return this.prisma.offer.update({
      where: { offerId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.nameAr !== undefined && { nameAr: data.nameAr }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.descriptionAr !== undefined && { descriptionAr: data.descriptionAr }),
        ...(data.offerType !== undefined && { offerType: data.offerType }),
        ...(data.discountValue !== undefined && { discountValue: data.discountValue }),
        ...(data.discountUnit !== undefined && { discountUnit: data.discountUnit }),
        ...(data.promoCode !== undefined && { promoCode: data.promoCode }),
        ...(data.serviceIds !== undefined && { serviceIds: data.serviceIds }),
        ...(data.providerIds !== undefined && { providerIds: data.providerIds }),
        ...(data.facilityIds !== undefined && { facilityIds: data.facilityIds }),
        ...(data.validFrom !== undefined && { validFrom: data.validFrom }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil }),
        ...(data.maxRedemptions !== undefined && { maxRedemptions: data.maxRedemptions }),
        ...(data.perPatientLimit !== undefined && { perPatientLimit: data.perPatientLimit }),
        ...(data.targetPreset !== undefined && { targetPreset: data.targetPreset }),
        ...(data.targetFilter !== undefined && { targetFilter: data.targetFilter as any }),
        ...(data.messageAr !== undefined && { messageAr: data.messageAr }),
        ...(data.messageEn !== undefined && { messageEn: data.messageEn }),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle: activate / pause / expire
  // -----------------------------------------------------------------------

  async activateOffer(offerId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { offerId } });
    if (!offer) throw new Error('Offer not found');
    if (!['draft', 'paused'].includes(offer.status)) {
      throw new Error(`Cannot activate offer in ${offer.status} status`);
    }

    const scriptAr = offer.messageAr || this.buildDefaultMessage(offer, 'ar');
    const scriptEn = offer.messageEn || this.buildDefaultMessage(offer, 'en');

    const targetFilter = this.resolveTargetFilter(offer);

    const campaignManager = new CampaignManager(this.prisma);
    const campaign = await this.prisma.campaign.create({
      data: {
        orgId: offer.orgId,
        name: `عرض: ${offer.nameAr || offer.name}`,
        nameAr: `عرض: ${offer.nameAr || offer.name}`,
        type: 'promotional',
        status: 'draft',
        targetFilter: targetFilter as any,
        channelSequence: ['whatsapp'],
        scriptAr,
        scriptEn,
        maxCallsPerHour: 50,
        startDate: offer.validFrom,
        endDate: offer.validUntil,
        offerId: offer.offerId,
      },
    });

    await campaignManager.startCampaign(campaign.campaignId);

    const updated = await this.prisma.offer.update({
      where: { offerId },
      data: { status: 'active' },
    });

    const targetCount = await this.prisma.campaignTarget.count({
      where: { campaignId: campaign.campaignId },
    });
    await this.prisma.offer.update({
      where: { offerId },
      data: { totalSent: targetCount },
    });

    return { offer: updated, campaignId: campaign.campaignId, targetsCreated: targetCount };
  }

  async pauseOffer(offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { offerId },
      include: { campaigns: { where: { status: 'active' } } },
    });
    if (!offer) throw new Error('Offer not found');

    const campaignManager = new CampaignManager(this.prisma);
    for (const campaign of offer.campaigns) {
      await campaignManager.pauseCampaign(campaign.campaignId);
    }

    return this.prisma.offer.update({
      where: { offerId },
      data: { status: 'paused' },
    });
  }

  async expireOffer(offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { offerId },
      include: { campaigns: { where: { status: { in: ['active', 'paused'] } } } },
    });
    if (!offer) throw new Error('Offer not found');

    const campaignManager = new CampaignManager(this.prisma);
    for (const campaign of offer.campaigns) {
      await campaignManager.completeCampaign(campaign.campaignId);
    }

    return this.prisma.offer.update({
      where: { offerId },
      data: { status: 'expired' },
    });
  }

  // -----------------------------------------------------------------------
  // Promo Code
  // -----------------------------------------------------------------------

  async generatePromoCode(_orgId: string): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    let attempts = 0;

    do {
      code = 'TW';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.prisma.offer.findUnique({ where: { promoCode: code } });
      if (!existing) return code;
      attempts++;
    } while (attempts < 20);

    code = 'TW';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async validatePromoCode(
    code: string,
    patientId?: string,
  ): Promise<{ valid: boolean; offer?: any; reason?: string }> {
    const offer = await this.prisma.offer.findUnique({ where: { promoCode: code.toUpperCase() } });
    if (!offer) return { valid: false, reason: 'invalid_code' };
    if (offer.status !== 'active') return { valid: false, reason: 'offer_inactive' };
    if (new Date() < offer.validFrom) return { valid: false, reason: 'not_started' };
    if (new Date() > offer.validUntil) return { valid: false, reason: 'expired' };

    if (offer.maxRedemptions && offer.totalRedeemed >= offer.maxRedemptions) {
      return { valid: false, reason: 'max_redemptions_reached' };
    }

    if (patientId) {
      const patientRedemptions = await this.prisma.offerRedemption.count({
        where: { offerId: offer.offerId, patientId, status: { not: 'cancelled' } },
      });
      if (patientRedemptions >= offer.perPatientLimit) {
        return { valid: false, reason: 'per_patient_limit_reached' };
      }
    }

    return { valid: true, offer };
  }

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  async getOfferAnalytics(offerId: string): Promise<OfferAnalytics> {
    const offer = await this.prisma.offer.findUnique({ where: { offerId } });
    if (!offer) throw new Error('Offer not found');

    const redemptions = await this.prisma.offerRedemption.findMany({
      where: { offerId },
    });

    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalDiscount = 0;
    let totalRevenue = 0;

    for (const r of redemptions) {
      const ch = r.channel || 'unknown';
      byChannel[ch] = (byChannel[ch] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.discountAmount) totalDiscount += r.discountAmount;
      if (r.finalPrice) totalRevenue += r.finalPrice;
    }

    const totalRedeemed = redemptions.length;

    return {
      offerId,
      name: offer.name,
      status: offer.status,
      totalSent: offer.totalSent,
      totalRedeemed,
      totalRevenue,
      redemptionRate: offer.totalSent > 0 ? totalRedeemed / offer.totalSent : 0,
      averageDiscount: totalRedeemed > 0 ? totalDiscount / totalRedeemed : 0,
      averageRevenue: totalRedeemed > 0 ? totalRevenue / totalRedeemed : 0,
      byChannel,
      byStatus,
    };
  }

  // -----------------------------------------------------------------------
  // Targeting Presets
  // -----------------------------------------------------------------------

  getPresets(): TargetPresetInfo[] {
    return TARGETING_PRESETS;
  }

  async previewAudience(orgId: string, filter: PatientFilter): Promise<{ count: number }> {
    const campaignManager = new CampaignManager(this.prisma);
    const patients = await campaignManager.queryPatientsByFilter(orgId, filter);

    const consentService = new MarketingConsentService(this.prisma);
    const consented = await consentService.bulkCheckConsent(
      patients.map((p) => p.patientId),
      orgId,
      'whatsapp',
    );

    return { count: consented.size };
  }

  // -----------------------------------------------------------------------
  // Offer Expiry (for cron job)
  // -----------------------------------------------------------------------

  async expireOverdueOffers(): Promise<number> {
    const overdueOffers = await this.prisma.offer.findMany({
      where: {
        status: 'active',
        validUntil: { lt: new Date() },
      },
    });

    for (const offer of overdueOffers) {
      await this.expireOffer(offer.offerId);
    }

    return overdueOffers.length;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private resolveTargetFilter(offer: { targetPreset: string | null; targetFilter: any }): PatientFilter {
    if (offer.targetPreset && offer.targetPreset !== 'custom') {
      const preset = TARGETING_PRESETS.find((p) => p.key === offer.targetPreset);
      if (preset) {
        return { ...preset.filter, ...(offer.targetFilter || {}) };
      }
    }
    return (offer.targetFilter || {}) as PatientFilter;
  }

  private buildDefaultMessage(
    offer: { name: string; nameAr: string | null; promoCode: string | null; discountValue: number | null; discountUnit: string | null; validUntil: Date },
    lang: 'ar' | 'en',
  ): string {
    const discount = this.formatDiscount(offer.discountValue, offer.discountUnit, lang);
    const expiry = offer.validUntil.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US');

    if (lang === 'ar') {
      return [
        `مرحباً {patient_name} 👋`,
        ``,
        `🎉 عرض خاص من عيادتكم: ${offer.nameAr || offer.name}`,
        discount ? `💰 ${discount}` : '',
        ``,
        `📋 كود العرض: ${offer.promoCode}`,
        `⏰ صالح حتى: ${expiry}`,
        ``,
        `للحجز، أرسل "حجز" أو استخدم الرابط:`,
        `{booking_link}`,
        ``,
        `للإلغاء أرسل: إلغاء`,
      ].filter(Boolean).join('\n');
    }

    return [
      `Hello {patient_name} 👋`,
      ``,
      `🎉 Special offer from your clinic: ${offer.name}`,
      discount ? `💰 ${discount}` : '',
      ``,
      `📋 Promo code: ${offer.promoCode}`,
      `⏰ Valid until: ${expiry}`,
      ``,
      `To book, reply "book" or use the link:`,
      `{booking_link}`,
      ``,
      `To unsubscribe, reply: stop`,
    ].filter(Boolean).join('\n');
  }

  private formatDiscount(value: number | null, unit: string | null, lang: 'ar' | 'en'): string {
    if (!value) return '';
    if (unit === 'percent') {
      return lang === 'ar' ? `خصم ${value}%` : `${value}% discount`;
    }
    if (unit === 'sar') {
      const sar = value / 100;
      return lang === 'ar' ? `خصم ${sar} ريال` : `${sar} SAR discount`;
    }
    return '';
  }
}
