import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { GoogleGenerativeAI } from '@google/generative-ai';

declare module 'fastify' {
  interface FastifyInstance {
    gemini: GoogleGenerativeAI;
    geminiConfigured: boolean;
  }
}

const geminiPlugin: FastifyPluginAsync = async (fastify) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    fastify.log.warn('GEMINI_API_KEY not configured - Gemini features will be disabled');
    fastify.decorate('gemini', null as unknown as GoogleGenerativeAI);
    fastify.decorate('geminiConfigured', false);
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  fastify.decorate('gemini', genAI);
  fastify.decorate('geminiConfigured', true);

  fastify.log.info('Gemini plugin initialized');
};

export default fp(geminiPlugin, {
  name: 'gemini',
});

export { geminiPlugin };
