import { PrismaClient } from '@prisma/client';

export interface ConsentChannels {
  smsMarketing?: boolean;
  whatsappMarketing?: boolean;
  voiceMarketing?: boolean;
  emailMarketing?: boolean;
}

export type ConsentSource = 'booking_form' | 'whatsapp_optin' | 'portal' | 'manual' | 'api';

export class MarketingConsentService {
  constructor(private prisma: PrismaClient) {}

  async grantConsent(
    patientId: string,
    orgId: string,
    channels: ConsentChannels,
    source: ConsentSource,
    consentText?: string,
    ipAddress?: string
  ) {
    return this.prisma.marketingConsent.upsert({
      where: { patientId_orgId: { patientId, orgId } },
      create: {
        patientId,
        orgId,
        smsMarketing: channels.smsMarketing ?? false,
        whatsappMarketing: channels.whatsappMarketing ?? false,
        voiceMarketing: channels.voiceMarketing ?? false,
        emailMarketing: channels.emailMarketing ?? false,
        consentSource: source,
        consentText,
        ipAddress,
      },
      update: {
        smsMarketing: channels.smsMarketing,
        whatsappMarketing: channels.whatsappMarketing,
        voiceMarketing: channels.voiceMarketing,
        emailMarketing: channels.emailMarketing,
        consentSource: source,
        consentText,
        ipAddress,
        revokedAt: null, // re-grant clears revocation
      },
    });
  }

  async revokeConsent(
    patientId: string,
    orgId: string,
    channels?: ConsentChannels
  ) {
    const existing = await this.prisma.marketingConsent.findUnique({
      where: { patientId_orgId: { patientId, orgId } },
    });
    if (!existing) return null;

    // If specific channels provided, revoke only those; otherwise revoke all
    const update: Record<string, unknown> = {};
    if (channels) {
      if (channels.smsMarketing === false) update.smsMarketing = false;
      if (channels.whatsappMarketing === false) update.whatsappMarketing = false;
      if (channels.voiceMarketing === false) update.voiceMarketing = false;
      if (channels.emailMarketing === false) update.emailMarketing = false;
    } else {
      update.smsMarketing = false;
      update.whatsappMarketing = false;
      update.voiceMarketing = false;
      update.emailMarketing = false;
    }

    // Check if all channels are now revoked
    const merged = {
      smsMarketing: update.smsMarketing ?? existing.smsMarketing,
      whatsappMarketing: update.whatsappMarketing ?? existing.whatsappMarketing,
      voiceMarketing: update.voiceMarketing ?? existing.voiceMarketing,
      emailMarketing: update.emailMarketing ?? existing.emailMarketing,
    };
    const allRevoked = !merged.smsMarketing && !merged.whatsappMarketing && !merged.voiceMarketing && !merged.emailMarketing;
    if (allRevoked) {
      update.revokedAt = new Date();
    }

    return this.prisma.marketingConsent.update({
      where: { patientId_orgId: { patientId, orgId } },
      data: update,
    });
  }

  async checkConsent(
    patientId: string,
    orgId: string,
    channel: 'sms' | 'whatsapp' | 'voice' | 'email'
  ): Promise<boolean> {
    const consent = await this.prisma.marketingConsent.findUnique({
      where: { patientId_orgId: { patientId, orgId } },
    });
    if (!consent || consent.revokedAt) return false;

    const channelMap: Record<string, keyof typeof consent> = {
      sms: 'smsMarketing',
      whatsapp: 'whatsappMarketing',
      voice: 'voiceMarketing',
      email: 'emailMarketing',
    };
    return consent[channelMap[channel]] as boolean;
  }

  async bulkCheckConsent(
    patientIds: string[],
    orgId: string,
    channel: 'sms' | 'whatsapp' | 'voice' | 'email'
  ): Promise<Set<string>> {
    const channelField = {
      sms: 'smsMarketing' as const,
      whatsapp: 'whatsappMarketing' as const,
      voice: 'voiceMarketing' as const,
      email: 'emailMarketing' as const,
    }[channel];

    const consented = await this.prisma.marketingConsent.findMany({
      where: {
        orgId,
        patientId: { in: patientIds },
        [channelField]: true,
        revokedAt: null,
      },
      select: { patientId: true },
    });

    return new Set(consented.map((c) => c.patientId));
  }

  async getConsentStatus(patientId: string, orgId: string) {
    return this.prisma.marketingConsent.findUnique({
      where: { patientId_orgId: { patientId, orgId } },
    });
  }

  async getOrgStats(orgId: string) {
    const [total, whatsapp, sms, voice, email, revoked] = await Promise.all([
      this.prisma.marketingConsent.count({ where: { orgId } }),
      this.prisma.marketingConsent.count({ where: { orgId, whatsappMarketing: true, revokedAt: null } }),
      this.prisma.marketingConsent.count({ where: { orgId, smsMarketing: true, revokedAt: null } }),
      this.prisma.marketingConsent.count({ where: { orgId, voiceMarketing: true, revokedAt: null } }),
      this.prisma.marketingConsent.count({ where: { orgId, emailMarketing: true, revokedAt: null } }),
      this.prisma.marketingConsent.count({ where: { orgId, revokedAt: { not: null } } }),
    ]);

    return { total, whatsapp, sms, voice, email, revoked };
  }
}
