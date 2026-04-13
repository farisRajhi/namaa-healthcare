import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default widget configurations per org
const DEFAULT_WIDGET_CONFIGS: Record<string, {
  orgName: string;
  theme: string;
  greeting: string;
  services: string[];
}> = {
  test: {
    orgName: 'عيادة توافد التجريبية',
    theme: 'teal',
    greeting: 'مرحباً! كيف أقدر أساعدك اليوم؟',
    services: ['حجز موعد', 'استفسار عام'],
  },
  default: {
    orgName: 'توافد',
    theme: 'teal',
    greeting: 'مرحباً! كيف أقدر أساعدك؟',
    services: ['حجز موعد', 'استفسار عام'],
  },
};

export default async function widgetRoutes(app: FastifyInstance) {
  /**
   * GET /api/widget/config/:orgId
   * Returns widget configuration for an organization
   */
  app.get('/config/:orgId', async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
    const { orgId } = request.params;

    // Look up org config (fallback to default)
    const config = DEFAULT_WIDGET_CONFIGS[orgId] || DEFAULT_WIDGET_CONFIGS.default;

    return reply.send({
      orgId,
      orgName: config.orgName,
      theme: config.theme,
      greeting: config.greeting,
      services: config.services,
    });
  });

  /**
   * GET /widget.js
   * Serve the compiled widget JavaScript file
   */
  app.get('/widget.js', async (_request: FastifyRequest, reply: FastifyReply) => {
    // Try multiple possible locations for the widget file
    const possiblePaths = [
      // Production: built widget in backend's public directory
      path.join(__dirname, '..', '..', 'public', 'widget.js'),
      // Development: built widget in frontend dist-widget
      path.join(__dirname, '..', '..', '..', 'frontend', 'dist-widget', 'widget.js'),
    ];

    for (const widgetPath of possiblePaths) {
      if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf-8');
        return reply
          .header('Content-Type', 'application/javascript; charset=utf-8')
          .header('Cache-Control', 'public, max-age=3600')
          .header('Access-Control-Allow-Origin', '*') // Intentional: widget JS must be loadable from any domain
          .send(content);
      }
    }

    // Widget not built yet
    return reply
      .status(404)
      .header('Content-Type', 'application/javascript')
      .send('// Tawafud Widget not built yet. Run: cd frontend && npm run build:widget');
  });
}
