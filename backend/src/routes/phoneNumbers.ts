import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// Validation schemas
const searchAvailableSchema = z.object({
  country: z.string().length(2).default('SA'), // ISO country code (SA = Saudi Arabia)
  areaCode: z.string().optional(),
  contains: z.string().optional(), // Number pattern to search for
  limit: z.coerce.number().min(1).max(20).default(10),
});

const purchaseNumberSchema = z.object({
  phoneNumber: z.string().min(10), // E.164 format: +966501234567
  friendlyName: z.string().optional(),
});

const registerForwardedSchema = z.object({
  twilioNumber: z.string().min(10), // The Twilio number calls forward to
  forwardedFrom: z.string().min(10), // User's original business number
  friendlyName: z.string().optional(),
});

const updatePhoneNumberSchema = z.object({
  friendlyName: z.string().optional(),
  isActive: z.boolean().optional(),
});

export default async function phoneNumbersRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  /**
   * GET /api/phone-numbers
   * List all phone numbers for the organization
   */
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    const phoneNumbers = await app.prisma.orgPhoneNumber.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: phoneNumbers };
  });

  /**
   * GET /api/phone-numbers/available
   * Search available phone numbers from Twilio to purchase
   */
  app.get('/available', async (request: FastifyRequest) => {
    if (!app.twilioConfigured || !app.twilio) {
      return { error: 'Twilio not configured', code: 'TWILIO_NOT_CONFIGURED' };
    }

    const query = searchAvailableSchema.parse(request.query);

    try {
      // Search for available local numbers
      const availableNumbers = await app.twilio.availablePhoneNumbers(query.country)
        .local
        .list({
          areaCode: query.areaCode ? parseInt(query.areaCode) : undefined,
          contains: query.contains,
          limit: query.limit,
        });

      // If no local numbers, try mobile
      if (availableNumbers.length === 0) {
        const mobileNumbers = await app.twilio.availablePhoneNumbers(query.country)
          .mobile
          .list({
            contains: query.contains,
            limit: query.limit,
          });

        return {
          data: mobileNumbers.map((n) => ({
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName,
            locality: n.locality,
            region: n.region,
            capabilities: n.capabilities,
          })),
          type: 'mobile',
        };
      }

      return {
        data: availableNumbers.map((n) => ({
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName,
          locality: n.locality,
          region: n.region,
          capabilities: n.capabilities,
        })),
        type: 'local',
      };
    } catch (error: any) {
      app.log.error('Error searching available numbers:', error);
      return {
        error: 'Failed to search available numbers',
        message: error.message,
      };
    }
  });

  /**
   * POST /api/phone-numbers/purchase
   * Purchase a new phone number from Twilio
   */
  app.post('/purchase', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    if (!app.twilioConfigured || !app.twilio) {
      return { error: 'Twilio not configured', code: 'TWILIO_NOT_CONFIGURED' };
    }

    const body = purchaseNumberSchema.parse(request.body);

    try {
      // Check if number already exists in our database
      const existing = await app.prisma.orgPhoneNumber.findUnique({
        where: { twilioNumber: body.phoneNumber },
      });

      if (existing) {
        return { error: 'Phone number already registered', code: 'NUMBER_EXISTS' };
      }

      // Purchase the number from Twilio
      const baseUrl = process.env.BASE_URL;
      if (!baseUrl) {
        return { error: 'BASE_URL not configured', code: 'CONFIG_ERROR' };
      }

      const purchasedNumber = await app.twilio.incomingPhoneNumbers.create({
        phoneNumber: body.phoneNumber,
        friendlyName: body.friendlyName || `AI Booking - ${body.phoneNumber}`,
        voiceUrl: `${baseUrl}/api/voice/incoming`,
        voiceMethod: 'POST',
        statusCallback: `${baseUrl}/api/voice/status`,
        statusCallbackMethod: 'POST',
      });

      // Save to database
      const phoneNumber = await app.prisma.orgPhoneNumber.create({
        data: {
          orgId,
          twilioNumber: purchasedNumber.phoneNumber,
          twilioSid: purchasedNumber.sid,
          numberType: 'twilio_owned',
          friendlyName: body.friendlyName || purchasedNumber.friendlyName,
          isActive: true,
        },
      });

      app.log.info(`Purchased phone number ${purchasedNumber.phoneNumber} for org ${orgId}`);

      return {
        success: true,
        data: phoneNumber,
      };
    } catch (error: any) {
      app.log.error('Error purchasing phone number:', error);
      return {
        error: 'Failed to purchase phone number',
        message: error.message,
        code: error.code || 'PURCHASE_FAILED',
      };
    }
  });

  /**
   * POST /api/phone-numbers/forward
   * Register a forwarded number (user forwards their existing number to a Twilio number)
   */
  app.post('/forward', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = registerForwardedSchema.parse(request.body);

    try {
      // Check if Twilio number already exists
      const existing = await app.prisma.orgPhoneNumber.findUnique({
        where: { twilioNumber: body.twilioNumber },
      });

      if (existing) {
        return { error: 'Twilio number already registered', code: 'NUMBER_EXISTS' };
      }

      // If Twilio is configured, verify the number exists in their account
      if (app.twilioConfigured && app.twilio) {
        try {
          const numbers = await app.twilio.incomingPhoneNumbers.list({
            phoneNumber: body.twilioNumber,
          });

          if (numbers.length === 0) {
            return {
              error: 'Twilio number not found in your account',
              code: 'NUMBER_NOT_FOUND',
              hint: 'Make sure you own this Twilio number or purchase it first',
            };
          }

          // Update the Twilio number webhooks
          const baseUrl = process.env.BASE_URL;
          if (baseUrl) {
            await app.twilio.incomingPhoneNumbers(numbers[0].sid).update({
              voiceUrl: `${baseUrl}/api/voice/incoming`,
              voiceMethod: 'POST',
              statusCallback: `${baseUrl}/api/voice/status`,
              statusCallbackMethod: 'POST',
            });
          }
        } catch (error: any) {
          app.log.warn('Could not verify Twilio number:', error.message);
        }
      }

      // Save to database
      const phoneNumber = await app.prisma.orgPhoneNumber.create({
        data: {
          orgId,
          twilioNumber: body.twilioNumber,
          numberType: 'forwarded',
          forwardedFrom: body.forwardedFrom,
          friendlyName: body.friendlyName || `Forwarded from ${body.forwardedFrom}`,
          isActive: true,
        },
      });

      app.log.info(`Registered forwarded number for org ${orgId}: ${body.forwardedFrom} -> ${body.twilioNumber}`);

      return {
        success: true,
        data: phoneNumber,
        instructions: {
          message: 'Now configure call forwarding on your carrier',
          steps: [
            `On your phone or carrier settings, set up call forwarding`,
            `Forward all calls from ${body.forwardedFrom} to ${body.twilioNumber}`,
            `Test by calling ${body.forwardedFrom} - the AI should answer`,
          ],
        },
      };
    } catch (error: any) {
      app.log.error('Error registering forwarded number:', error);
      return {
        error: 'Failed to register forwarded number',
        message: error.message,
      };
    }
  });

  /**
   * GET /api/phone-numbers/:id
   * Get a single phone number
   */
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const phoneNumber = await app.prisma.orgPhoneNumber.findFirst({
      where: { phoneNumberId: id, orgId },
    });

    if (!phoneNumber) {
      return { error: 'Phone number not found', code: 'NOT_FOUND' };
    }

    return { data: phoneNumber };
  });

  /**
   * PATCH /api/phone-numbers/:id
   * Update phone number settings
   */
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = updatePhoneNumberSchema.parse(request.body);

    const phoneNumber = await app.prisma.orgPhoneNumber.findFirst({
      where: { phoneNumberId: id, orgId },
    });

    if (!phoneNumber) {
      return { error: 'Phone number not found', code: 'NOT_FOUND' };
    }

    const updated = await app.prisma.orgPhoneNumber.update({
      where: { phoneNumberId: id },
      data: {
        ...(body.friendlyName !== undefined && { friendlyName: body.friendlyName }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return { success: true, data: updated };
  });

  /**
   * DELETE /api/phone-numbers/:id
   * Delete/release a phone number
   */
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const phoneNumber = await app.prisma.orgPhoneNumber.findFirst({
      where: { phoneNumberId: id, orgId },
    });

    if (!phoneNumber) {
      return { error: 'Phone number not found', code: 'NOT_FOUND' };
    }

    // If it's a Twilio-owned number, release it back to Twilio
    if (phoneNumber.numberType === 'twilio_owned' && phoneNumber.twilioSid) {
      if (app.twilioConfigured && app.twilio) {
        try {
          await app.twilio.incomingPhoneNumbers(phoneNumber.twilioSid).remove();
          app.log.info(`Released Twilio number ${phoneNumber.twilioNumber}`);
        } catch (error: any) {
          app.log.error('Error releasing Twilio number:', error);
          // Continue with deletion even if Twilio release fails
        }
      }
    }

    // Delete from database
    await app.prisma.orgPhoneNumber.delete({
      where: { phoneNumberId: id },
    });

    return { success: true, message: 'Phone number deleted' };
  });

  /**
   * POST /api/phone-numbers/:id/test
   * Initiate a test call to verify the number works
   */
  app.post<{ Params: { id: string } }>('/:id/test', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const body = z.object({
      toNumber: z.string().min(10), // Number to call for testing
    }).parse(request.body);

    if (!app.twilioConfigured || !app.twilio) {
      return { error: 'Twilio not configured', code: 'TWILIO_NOT_CONFIGURED' };
    }

    const phoneNumber = await app.prisma.orgPhoneNumber.findFirst({
      where: { phoneNumberId: id, orgId },
    });

    if (!phoneNumber) {
      return { error: 'Phone number not found', code: 'NOT_FOUND' };
    }

    try {
      const baseUrl = process.env.BASE_URL;

      // Make an outbound call to the test number
      const call = await app.twilio.calls.create({
        to: body.toNumber,
        from: phoneNumber.twilioNumber,
        url: `${baseUrl}/api/voice/incoming`, // Use the same handler
        statusCallback: `${baseUrl}/api/voice/status`,
      });

      return {
        success: true,
        message: 'Test call initiated',
        callSid: call.sid,
      };
    } catch (error: any) {
      app.log.error('Error initiating test call:', error);
      return {
        error: 'Failed to initiate test call',
        message: error.message,
      };
    }
  });
}
