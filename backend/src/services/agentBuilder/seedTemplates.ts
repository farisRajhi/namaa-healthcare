// ─────────────────────────────────────────────────────────
// Agent Builder — Template Seeder
// Seeds built-in flow templates into the database
// ─────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client'
import { ALL_TEMPLATES, FlowTemplate } from './templates.js'

/**
 * Seed all built-in flow templates for a given org.
 * Skips templates that already exist (by templateCategory + isTemplate).
 */
export async function seedFlowTemplates(prisma: PrismaClient, orgId: string): Promise<void> {
  console.log('🔧 Seeding Agent Builder templates...\n')

  for (const template of ALL_TEMPLATES) {
    // Check if template already exists
    const existing = await prisma.agentFlow.findFirst({
      where: {
        orgId,
        isTemplate: true,
        templateCategory: template.templateCategory,
      },
    })

    if (existing) {
      console.log(`  ⏭️  Template "${template.nameAr}" (${template.templateCategory}) already exists, skipping`)
      continue
    }

    await prisma.agentFlow.create({
      data: {
        orgId,
        name: template.name,
        nameAr: template.nameAr,
        description: template.description,
        descriptionAr: template.descriptionAr,
        nodes: template.nodes as any,
        edges: template.edges as any,
        variables: template.variables,
        settings: template.settings,
        isTemplate: true,
        isActive: false,
        templateCategory: template.templateCategory,
      },
    })

    console.log(`  ✅ Template "${template.nameAr}" (${template.templateCategory}) created`)
  }

  console.log('\n🎉 Agent Builder template seeding complete!')
}

/**
 * Standalone seeder — can be called directly via `npx tsx`
 */
async function main() {
  const prisma = new PrismaClient()
  try {
    // Find the first org to seed templates for
    const org = await prisma.org.findFirst()
    if (!org) {
      console.error('❌ No organization found. Run the main seed first.')
      process.exit(1)
    }

    await seedFlowTemplates(prisma, org.orgId)
  } catch (err) {
    console.error('❌ Seeding failed:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
const isMain = process.argv[1]?.includes('seedTemplates')
if (isMain) {
  main()
}
