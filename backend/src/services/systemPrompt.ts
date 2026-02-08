import { PrismaClient } from '@prisma/client';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export async function buildSystemPrompt(prisma: PrismaClient, orgId: string): Promise<string> {
  // Fetch org info
  const org = await prisma.org.findUnique({
    where: { orgId },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  // Fetch departments
  const departments = await prisma.department.findMany({
    where: { orgId },
    orderBy: { name: 'asc' },
  });

  // Fetch facilities
  const facilities = await prisma.facility.findMany({
    where: { orgId },
    orderBy: { name: 'asc' },
  });

  // Fetch active providers with services and availability
  const providers = await prisma.provider.findMany({
    where: { orgId, active: true },
    include: {
      department: true,
      facility: true,
      services: {
        include: { service: true },
      },
      availabilityRules: {
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  // Fetch active services
  const services = await prisma.service.findMany({
    where: { orgId, active: true },
    orderBy: { name: 'asc' },
  });

  // Build the system prompt
  let prompt = `You are a helpful healthcare appointment booking assistant for ${org.name}.
You help patients understand available services, find suitable providers, and answer questions about the clinic.

This is a TEST conversation for the business owner to verify the AI understands their setup.

`;

  // Departments section
  if (departments.length > 0) {
    prompt += `## Available Departments\n`;
    departments.forEach(dept => {
      const providerCount = providers.filter(p => p.departmentId === dept.departmentId).length;
      prompt += `- ${dept.name} (${providerCount} provider${providerCount !== 1 ? 's' : ''})\n`;
    });
    prompt += `\n`;
  }

  // Facilities section
  if (facilities.length > 0) {
    prompt += `## Facilities (Locations)\n`;
    facilities.forEach(facility => {
      let location = facility.name;
      if (facility.city) {
        location += `, ${facility.city}`;
      }
      if (facility.timezone) {
        location += ` (${facility.timezone})`;
      }
      prompt += `- ${location}\n`;
      if (facility.addressLine1) {
        prompt += `  Address: ${facility.addressLine1}`;
        if (facility.addressLine2) prompt += `, ${facility.addressLine2}`;
        prompt += `\n`;
      }
    });
    prompt += `\n`;
  }

  // Services section
  if (services.length > 0) {
    prompt += `## Services Offered\n`;
    services.forEach(service => {
      prompt += `- ${service.name} (${service.durationMin} minutes)\n`;
    });
    prompt += `\n`;
  }

  // Providers section
  if (providers.length > 0) {
    prompt += `## Providers\n`;
    providers.forEach(provider => {
      let providerInfo = `- ${provider.displayName}`;
      if (provider.credentials) {
        providerInfo += `, ${provider.credentials}`;
      }
      prompt += providerInfo + `\n`;

      if (provider.department) {
        prompt += `  Department: ${provider.department.name}\n`;
      }
      if (provider.facility) {
        prompt += `  Location: ${provider.facility.name}\n`;
      }

      // Services
      if (provider.services.length > 0) {
        const serviceNames = provider.services.map(ps => ps.service.name).join(', ');
        prompt += `  Services: ${serviceNames}\n`;
      }

      // Availability
      if (provider.availabilityRules.length > 0) {
        const availabilityByDay: Record<number, string[]> = {};
        provider.availabilityRules.forEach(rule => {
          if (!availabilityByDay[rule.dayOfWeek]) {
            availabilityByDay[rule.dayOfWeek] = [];
          }
          availabilityByDay[rule.dayOfWeek].push(`${formatTime(rule.startLocal)}-${formatTime(rule.endLocal)}`);
        });

        const availableDays = Object.entries(availabilityByDay)
          .map(([day, times]) => `${DAYS_OF_WEEK[parseInt(day)]}: ${times.join(', ')}`)
          .join('; ');
        prompt += `  Available: ${availableDays}\n`;
      }

      prompt += `\n`;
    });
  }

  // Guidelines
  prompt += `## Guidelines
- Be helpful and professional
- Provide accurate information based on the data above
- If asked about booking, explain the available services, providers, and their schedules
- Do not make up information that is not provided above
- For actual bookings, direct users to use the official booking channels (WhatsApp, phone, etc.)
- Keep responses concise and relevant
`;

  return prompt;
}
