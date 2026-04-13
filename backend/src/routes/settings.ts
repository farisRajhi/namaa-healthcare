import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  defaultTimezone: z.string().min(1).optional(),
});

const updateUserProfileSchema = z.object({
  name: z.string().min(1).optional(),
  nameAr: z.string().optional(),
});

const updateNotificationsSchema = z.object({
  newBookingAlerts: z.boolean().optional(),
  negativeFeedbackAlerts: z.boolean().optional(),
  dailyReport: z.boolean().optional(),
  weeklyReport: z.boolean().optional(),
});

const updateAiAutoReplySchema = z.object({
  aiAutoReply: z.boolean(),
});

export default async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Get organization settings
  app.get('/org', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const org = await app.prisma.org.findUnique({
      where: { orgId },
    });
    if (!org) return { error: 'Organization not found' };

    return {
      data: {
        orgId: org.orgId,
        name: org.name,
        defaultTimezone: org.defaultTimezone,
        aiAutoReply: org.aiAutoReply,
      },
    };
  });

  // Update organization settings
  app.put('/org', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = updateOrgSchema.parse(request.body);

    const org = await app.prisma.org.update({
      where: { orgId },
      data: body,
    });

    return {
      data: {
        orgId: org.orgId,
        name: org.name,
        defaultTimezone: org.defaultTimezone,
        aiAutoReply: org.aiAutoReply,
      },
    };
  });

  // Get AI auto-reply status
  app.get('/ai-auto-reply', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const org = await app.prisma.org.findUnique({
      where: { orgId },
      select: { aiAutoReply: true },
    });
    return { data: { aiAutoReply: org?.aiAutoReply ?? true } };
  });

  // Toggle AI auto-reply
  app.put('/ai-auto-reply', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = updateAiAutoReplySchema.parse(request.body);

    const org = await app.prisma.org.update({
      where: { orgId },
      data: { aiAutoReply: body.aiAutoReply },
      select: { aiAutoReply: true },
    });

    return { data: { aiAutoReply: org.aiAutoReply } };
  });

  // Get user profile
  app.get('/profile', async (request: FastifyRequest) => {
    const { userId } = request.user;
    const user = await app.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        name: true,
        nameAr: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
      },
    });
    return { data: user };
  });

  // Update user profile
  app.put('/profile', async (request: FastifyRequest) => {
    const { userId } = request.user;
    const body = updateUserProfileSchema.parse(request.body);

    const user = await app.prisma.user.update({
      where: { userId },
      data: body,
      select: {
        userId: true,
        email: true,
        name: true,
        nameAr: true,
        isActive: true,
        lastLogin: true,
      },
    });
    return { data: user };
  });

  // Get notification preferences (stored in user settings JSON or a separate table)
  // For now, use a simple approach — store in a FacilityConfig or user preferences
  // We'll use OrgId-scoped config via a simple JSON approach
  app.get('/notifications', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    // Try to get from the first facility config as org-level defaults
    // Find any facility for this org, then look up its config
    const facility = await app.prisma.facility.findFirst({ where: { orgId } });
    const config = facility
      ? await app.prisma.facilityConfig.findUnique({ where: { facilityId: facility.facilityId } })
      : null;

    // Return defaults if no config exists
    return {
      data: {
        newBookingAlerts: true,
        negativeFeedbackAlerts: true,
        dailyReport: false,
        weeklyReport: true,
        ...(config?.businessHours && typeof config.businessHours === 'object'
          ? (config.businessHours as Record<string, any>).notifications || {}
          : {}),
      },
    };
  });

  // Update notification preferences
  app.put('/notifications', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = updateNotificationsSchema.parse(request.body);

    // Find or create facility config
    const facility = await app.prisma.facility.findFirst({ where: { orgId } });

    if (facility) {
      const existingConfig = await app.prisma.facilityConfig.findUnique({
        where: { facilityId: facility.facilityId },
      });

      if (existingConfig) {
        const currentBizHours = (existingConfig.businessHours as Record<string, any>) || {};
        await app.prisma.facilityConfig.update({
          where: { configId: existingConfig.configId },
          data: {
            businessHours: { ...currentBizHours, notifications: body },
            updatedAt: new Date(),
          },
        });
      } else {
        await app.prisma.facilityConfig.create({
          data: {
            facilityId: facility.facilityId,
            businessHours: { notifications: body },
          },
        });
      }
    }

    return { data: body, message: 'Notification preferences saved' };
  });

  // Get all settings in one call
  app.get('/all', async (request: FastifyRequest) => {
    const { orgId, userId } = request.user;

    const [org, user] = await Promise.all([
      app.prisma.org.findUnique({ where: { orgId } }),
      app.prisma.user.findUnique({
        where: { userId },
        select: {
          userId: true,
          email: true,
          name: true,
          nameAr: true,
        },
      }),
    ]);

    return {
      data: {
        org: org ? { orgId: org.orgId, name: org.name, defaultTimezone: org.defaultTimezone, aiAutoReply: org.aiAutoReply } : null,
        user,
      },
    };
  });
}
