import { describe, expect, it } from 'vitest';
import { roleTemplates } from '../features/access/catalog';
import { AppError, assertOwnCashSession, assertPermission, assertPlatformAccess, assertRoomAssignmentManager, canAccessGodMode, canViewGodModeProfile, roomAssignmentFilter } from './policy';

describe('administration plateforme', () => {
  it('réserve la console aux comptes Super Administrateur', () => {
    expect(() => assertPlatformAccess({ platformAdmin: true })).not.toThrow();
  });

  describe('permissions de réception', () => {
    it('autorise les encaissements ordinaires sans ouvrir la comptabilité générale', () => {
      const receptionist = roleTemplates.find((role) => role.code === 'RECEPTIONIST');
      const scope = {
        userId: 'receptionist-1',
        name: 'Réceptionniste 1',
        permissions: receptionist?.permissions ?? [],
      };

      expect(() => assertPermission(scope, 'payments.collect')).not.toThrow();
      expect(() => assertPermission(scope, 'accounting.view')).toThrowError(AppError);
    });

    it('limite les sessions de caisse à leur propriétaire', () => {
      const scope = {
        userId: 'receptionist-1',
        name: 'Réceptionniste 1',
        permissions: ['cash_sessions.view_own'],
      };
      const session = { userId: 'receptionist-1' };

      expect(() => assertOwnCashSession(scope, session)).not.toThrow();
      expect(() => assertOwnCashSession(scope, { ...session, userId: 'receptionist-2' })).toThrowError(AppError);
    });
  });

  it.each(['OWNER', 'GENERAL_MANAGER', 'HOTEL_ADMIN', 'RECEPTIONIST', 'ACCOUNTANT', 'GOUVERNANTE', 'HOUSEKEEPER'])(
    'refuse le profil %s',
    () => {
      try {
        assertPlatformAccess({ platformAdmin: false });
        throw new Error('Une permission plateforme ne devrait pas être accordée.');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).status).toBe(403);
      }
    },
  );
});

describe('attributions centralisées des chambres', () => {
  it('permet au Propriétaire et au Super Administrateur de gérer les affectations', () => {
    expect(() => assertRoomAssignmentManager({ platformAdmin: true })).not.toThrow();
    expect(() => assertRoomAssignmentManager({ platformAdmin: false, role: { code: 'OWNER' } })).not.toThrow();
  });

  it('interdit à un Administrateur Hôtel de modifier les affectations, y compris la sienne', () => {
    expect(() => assertRoomAssignmentManager({ platformAdmin: false, role: { code: 'HOTEL_ADMIN' } })).toThrowError(AppError);
  });

  it('limite chaque Administrateur Hôtel à son propre périmètre; les rôles superviseurs gardent la vue complète', () => {
    expect(roomAssignmentFilter('HOTEL_ADMIN', 'admin-a')).toEqual({ assignedHotelAdminId: 'admin-a' });
    expect(roomAssignmentFilter('HOTEL_ADMIN', 'admin-b')).toEqual({ assignedHotelAdminId: 'admin-b' });
    expect(roomAssignmentFilter('OWNER', 'owner')).toEqual({});
    expect(roomAssignmentFilter(undefined, 'super-admin')).toEqual({});
  });
});

describe('God Mode en consultation de profils', () => {
  it('autorise le Super Administrateur et le Propriétaire à consulter les profils sans modifier leur session', () => {
    const profile = { platformAdmin: false, roleCode: 'RECEPTIONIST' };
    expect(canViewGodModeProfile({ platformAdmin: true }, profile)).toBe(true);
    const owner = { platformAdmin: false, role: { code: 'OWNER' } };
    expect(canViewGodModeProfile(owner, profile)).toBe(true);
    expect(canViewGodModeProfile(owner, { platformAdmin: true, roleCode: 'SUPER_ADMIN' })).toBe(false);
  });

  it('refuse au Directeur général les profils Super Administrateur et Propriétaire', () => {
    const actor = { platformAdmin: false, role: { code: 'GENERAL_MANAGER' } };
    expect(canViewGodModeProfile(actor, { platformAdmin: true, roleCode: 'SUPER_ADMIN' })).toBe(false);
    expect(canViewGodModeProfile(actor, { platformAdmin: false, roleCode: 'OWNER' })).toBe(false);
    expect(canViewGodModeProfile(actor, { platformAdmin: false, roleCode: 'RECEPTIONIST' })).toBe(true);
  });

  it('n’accorde pas le God Mode aux autres rôles', () => {
    const actor = { platformAdmin: false, role: { code: 'HOTEL_ADMIN' } };
    expect(canAccessGodMode(actor)).toBe(false);
    expect(canViewGodModeProfile(actor, { platformAdmin: false, roleCode: 'RECEPTIONIST' })).toBe(false);
  });
});
