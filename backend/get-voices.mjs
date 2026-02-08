import { ElevenLabs } from 'elevenlabs';

// Get API key from command line or env
const apiKey = process.argv[2] || process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  console.error('Usage: node get-voices.mjs YOUR_ELEVENLABS_API_KEY');
  process.exit(1);
}

const client = new ElevenLabs({ apiKey });

console.log('Fetching voices from ElevenLabs...\n');

try {
  const response = await client.voices.getAll();

  console.log(`Found ${response.voices.length} voices:\n`);

  response.voices.forEach((voice, index) => {
    console.log(`${index + 1}. ${voice.name}`);
    console.log(`   Voice ID: ${voice.voice_id}`);
    console.log(`   Category: ${voice.category || 'N/A'}`);
    console.log(`   Labels: ${JSON.stringify(voice.labels || {})}`);
    console.log('');
  });

  // Find Abu Salem specifically
  const abuSalem = response.voices.find(v =>
    v.name.toLowerCase().includes('abu salem') ||
    v.name.toLowerCase().includes('abu') && v.name.toLowerCase().includes('salem')
  );

  if (abuSalem) {
    console.log('===================================');
    console.log('FOUND ABU SALEM VOICE:');
    console.log(`Name: ${abuSalem.name}`);
    console.log(`Voice ID: ${abuSalem.voice_id}`);
    console.log('===================================');
  } else {
    console.log('Abu Salem voice not found in your account.');
    console.log('Make sure the voice is added to your ElevenLabs voice library.');
  }

} catch (error) {
  console.error('Error fetching voices:', error.message);
  process.exit(1);
}
