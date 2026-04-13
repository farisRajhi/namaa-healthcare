/**
 * Skill Loader for Patient Intelligence Agent
 *
 * Loads domain-specific knowledge files that are injected into AI prompts.
 * Skills are loaded selectively based on clinic type to minimize token usage.
 */
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILLS_DIR = join(__dirname, 'skills');

/** Maximum total skill content in characters (~4000 tokens ≈ 16000 chars) */
const MAX_SKILL_CHARS = 16_000;

/** Specialty skills mapped by clinic type */
const SPECIALTY_SKILLS: Record<string, string[]> = {
  dental: ['dental.md'],
  dermatology: ['dermatology.md'],
  cosmetic: ['dermatology.md'],
  ophthalmology: ['general.md'],
  pediatrics: ['general.md'],
  orthopedic: ['general.md'],
  general: ['general.md'],
};

/** These skills are always loaded regardless of clinic type */
const ALWAYS_LOAD = ['saudiPatientBehavior.md', 'campaignBestPractices.md'];

/**
 * Determine which skill files to load for a given clinic type.
 */
export function getSkillNames(clinicType: string): string[] {
  const specialty = SPECIALTY_SKILLS[clinicType.toLowerCase()] || ['general.md'];
  return [...specialty, ...ALWAYS_LOAD];
}

/**
 * Load and concatenate skill file contents.
 * Each skill is prefixed with a header for clarity in the AI prompt.
 * Content is truncated if it exceeds the token budget.
 */
export async function loadSkills(skillNames: string[]): Promise<string> {
  const sections: string[] = [];
  let totalChars = 0;

  for (const name of skillNames) {
    if (totalChars >= MAX_SKILL_CHARS) break;

    try {
      const filePath = join(SKILLS_DIR, name);
      const content = await readFile(filePath, 'utf-8');
      const trimmed = content.trim();

      // Truncate if adding this skill would exceed budget
      const remaining = MAX_SKILL_CHARS - totalChars;
      const text = trimmed.length > remaining ? trimmed.slice(0, remaining) + '\n...(truncated)' : trimmed;

      sections.push(text);
      totalChars += text.length;
    } catch {
      // Skill file not found — skip silently
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Load skills for a specific clinic type (convenience wrapper).
 */
export async function loadSkillsForClinicType(clinicType: string): Promise<{ content: string; names: string[] }> {
  const names = getSkillNames(clinicType);
  const content = await loadSkills(names);
  return { content, names };
}
