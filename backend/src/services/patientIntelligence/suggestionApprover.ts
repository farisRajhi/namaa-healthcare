/**
 * Suggestion Approver
 *
 * Converts an approved AICampaignSuggestion into a real Campaign
 * using the existing CampaignManager. Creates Patient records for
 * external patients that don't exist yet.
 */
import { PrismaClient } from '@prisma/client';
import { CampaignManager } from '../campaigns/campaignManager.js';
import type { CampaignCreateInput } from '../campaigns/campaignManager.js';

export interface ApproveInput {
  suggestionId: string;
  userId: string;
  overrides?: {
    scriptAr?: string;
    scriptEn?: string;
    channelSequence?: string[];
  };
}

export interface ApproveResult {
  campaignId: string;
  targetsCreated: number;
}

/**
 * Approve an AI suggestion and convert it into a real campaign.
 *
 * Flow:
 * 1. Load the suggestion + its external patients
 * 2. For each external patient: upsert a real Patient record (or use matched)
 * 3. Create a Campaign via CampaignManager with patientIds filter
 * 4. Start the campaign to resolve targets
 * 5. Update suggestion status to "launched"
 */
export async function approveSuggestion(
  prisma: PrismaClient,
  campaignManager: CampaignManager,
  input: ApproveInput,
): Promise<ApproveResult> {
  const { suggestionId, userId, overrides } = input;

  // 1. Load suggestion
  const suggestion = await prisma.aICampaignSuggestion.findUnique({
    where: { suggestionId },
  });
  if (!suggestion) throw new Error('Suggestion not found');
  if (suggestion.status !== 'pending' && suggestion.status !== 'edited') {
    throw new Error(`Cannot approve suggestion in "${suggestion.status}" status`);
  }

  // 2. Load external patients for this suggestion (orgId-scoped to prevent cross-tenant leak)
  const externalPatients = await prisma.externalPatient.findMany({
    where: {
      externalPatientId: { in: suggestion.patientIds },
      orgId: suggestion.orgId,
    },
  });

  // 3. Ensure each external patient has a real Patient record
  const realPatientIds: string[] = [];

  for (const ep of externalPatients) {
    if (ep.matchedPatientId) {
      // Already matched to existing patient
      realPatientIds.push(ep.matchedPatientId);
      continue;
    }

    // Create a new Patient record
    const [firstName, ...lastParts] = (ep.name || ep.nameAr || 'Unknown').split(' ');
    const lastName = lastParts.join(' ') || '';

    const patient = await prisma.patient.create({
      data: {
        orgId: suggestion.orgId,
        firstName,
        lastName,
        dateOfBirth: ep.dateOfBirth,
        sex: ep.sex,
      },
    });

    // Create phone contact if available
    if (ep.phone) {
      await prisma.patientContact.create({
        data: {
          patientId: patient.patientId,
          contactType: 'phone',
          contactValue: ep.phone,
          isPrimary: true,
        },
      });
    }

    // Update external patient with the match
    await prisma.externalPatient.update({
      where: { externalPatientId: ep.externalPatientId },
      data: { matchedPatientId: patient.patientId, matchConfidence: 1.0 },
    });

    realPatientIds.push(patient.patientId);
  }

  // 4. Create campaign via CampaignManager
  const campaignInput: CampaignCreateInput = {
    orgId: suggestion.orgId,
    name: suggestion.name,
    nameAr: suggestion.nameAr || undefined,
    type: (suggestion.type as CampaignCreateInput['type']) || 'recall',
    targetFilter: {
      patientIds: realPatientIds,
    },
    channelSequence: overrides?.channelSequence || suggestion.channelSequence,
    scriptAr: overrides?.scriptAr || suggestion.scriptAr || undefined,
    scriptEn: overrides?.scriptEn || suggestion.scriptEn || undefined,
  };

  const campaign = await campaignManager.createCampaign(campaignInput);

  // 5. Start the campaign (resolves targets + activates)
  const { targetsCreated } = await campaignManager.startCampaign(campaign.campaignId);

  // 6. Update suggestion status
  await prisma.aICampaignSuggestion.update({
    where: { suggestionId },
    data: {
      status: 'launched',
      reviewedBy: userId,
      reviewedAt: new Date(),
      campaignId: campaign.campaignId,
    },
  });

  return {
    campaignId: campaign.campaignId,
    targetsCreated,
  };
}

/**
 * Reject a suggestion.
 */
export async function rejectSuggestion(
  prisma: PrismaClient,
  suggestionId: string,
  userId: string,
  notes?: string,
): Promise<void> {
  await prisma.aICampaignSuggestion.update({
    where: { suggestionId },
    data: {
      status: 'rejected',
      reviewedBy: userId,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
  });
}

/**
 * Edit a suggestion's message content before approving.
 */
export async function editSuggestion(
  prisma: PrismaClient,
  suggestionId: string,
  updates: { scriptAr?: string; scriptEn?: string; channelSequence?: string[] },
): Promise<void> {
  await prisma.aICampaignSuggestion.update({
    where: { suggestionId },
    data: {
      status: 'edited',
      ...(updates.scriptAr !== undefined && { scriptAr: updates.scriptAr }),
      ...(updates.scriptEn !== undefined && { scriptEn: updates.scriptEn }),
      ...(updates.channelSequence !== undefined && { channelSequence: updates.channelSequence }),
    },
  });
}
