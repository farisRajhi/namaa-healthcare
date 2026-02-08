import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import OpenAI from 'openai';

declare module 'fastify' {
  interface FastifyInstance {
    openai: OpenAI;
  }
}

const openaiPlugin: FastifyPluginAsync = async (fastify) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  fastify.decorate('openai', openai);
};

export default fp(openaiPlugin, {
  name: 'openai',
});

export { openaiPlugin };
