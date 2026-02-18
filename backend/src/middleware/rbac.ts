/**
 * RBAC Middleware — Role-Based Access Control
 *
 * Restricts routes to users whose JWT contains an allowed role.
 * Use as a preHandler hook on sensitive admin routes.
 *
 * Roles stored in the `Role` table (e.g. "admin", "manager", "viewer").
 * The JWT must include a `role` field (see auth.ts / login route).
 */
import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Returns a Fastify preHandler that allows access only if
 * the authenticated user's role is in the `roles` array.
 *
 * Usage:
 *   app.get('/admin/...', { preHandler: [app.authenticate, requireRole(['admin'])] }, handler)
 *
 *   — or on a whole plugin scope —
 *   app.addHook('preHandler', requireRole(['admin', 'manager']));
 */
export const requireRole = (roles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as any;
    if (!user || !roles.includes(user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
    }
  };
};

/**
 * Admin-only shortcut: ['admin']
 */
export const requireAdmin = requireRole(['admin']);

/**
 * Manager or admin: ['admin', 'manager']
 */
export const requireManager = requireRole(['admin', 'manager']);
