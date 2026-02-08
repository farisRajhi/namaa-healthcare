import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check if phone number already exists
  const existing = await prisma.orgPhoneNumber.findFirst({
    where: {
      twilioNumber: '+17078745670'
    }
  });

  if (existing) {
    console.log('Phone number already registered:', existing);
    await prisma.$disconnect();
    return;
  }

  // Register the phone number
  const phoneNumber = await prisma.orgPhoneNumber.create({
    data: {
      orgId: 'c71faf9b-cc46-48c3-8c87-7a98e5426694',
      twilioNumber: '+17078745670',
      twilioSid: 'PN646cacbc7ac7239c7920263dc76d4f4e',
      numberType: 'twilio_owned',
      isActive: true,
      friendlyName: 'Voice AI Line'
    }
  });

  console.log('Phone number registered successfully:', phoneNumber);
  await prisma.$disconnect();
}

main();
