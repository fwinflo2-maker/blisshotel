import { describe, expect, it } from "vitest";
import { allPermissions, permissionsWithEnabledFeatures, roleTemplates } from "./catalog";

describe("catalogue RBAC", () => {
  it("propose 11 profils standards sans rôles spécialisés facultatifs", () => {
    const standard = roleTemplates.filter((role) => !role.optional);
    expect(standard).toHaveLength(11);
    expect(roleTemplates.filter((role) => role.optional)).toHaveLength(0);
    expect(roleTemplates.some((role) => ["CASHIER", "RESERVATION_MANAGER"].includes(role.code))).toBe(false);
  });

  it("sépare la supervision du bar des droits réservés à son personnel", () => {
    const manager = roleTemplates.find((role) => role.code === "RESTAURANT_MANAGER");
    const server = roleTemplates.find((role) => role.code === "BAR_SERVER");
    expect(manager?.permissions).toEqual(expect.arrayContaining([
      "restaurant.menu.manage", "restaurant.orders.manage", "restaurant.folio.transfer",
    ]));
    expect(server?.permissions).toEqual(expect.arrayContaining(["dashboard.view", "restaurant.orders.manage"]));
    expect(server?.permissions).not.toContain("restaurant.menu.manage");
    expect(server?.permissions).not.toContain("restaurant.folio.transfer");
  });

  it("donne à la Gouvernante la supervision et réserve l’exécution à l’Agent d’entretien", () => {
    const manager = roleTemplates.find((role) => role.code === "GOUVERNANTE");
    const housekeeper = roleTemplates.find((role) => role.code === "HOUSEKEEPER");

    expect(manager?.permissions).toEqual(expect.arrayContaining([
      "housekeeping.tasks.assign",
      "housekeeping.rooms.inspect",
      "housekeeping.agents.manage",
    ]));
    expect(manager?.permissions).not.toContain("housekeeping.tasks.execute");
    expect(housekeeper?.permissions).toContain("housekeeping.tasks.execute");
    expect(housekeeper?.permissions).not.toContain("housekeeping.tasks.assign");
    expect(housekeeper?.permissions).not.toContain("housekeeping.rooms.inspect");
    expect(housekeeper?.permissions).not.toContain("housekeeping.agents.manage");
  });

  it("donne au Propriétaire les fonctions de gestion hôtelière sans le privilège plateforme", () => {
    const owner = roleTemplates.find((role) => role.code === "OWNER");
    expect(owner?.permissions).toEqual(expect.arrayContaining([
      "users.manage",
      "roles.assign",
      "permissions.manage",
      "audit.view",
      "reservations.create",
      "clients.update",
      "stays.checkin",
      "payments.collect",
      "payments.refund",
      "cash_sessions.view_all",
      "rooms.manage",
      "housekeeping.tasks.assign",
      "restaurant.orders.manage",
      "maintenance.tickets.manage",
    ]));
    expect(owner?.permissions).not.toContain("platform.manage");
  });

  it("donne au Comptable l’accès en lecture aux données financières et aux clôtures, sans droit de mutation sensible", () => {
    const accountant = roleTemplates.find((role) => role.code === "ACCOUNTANT");
    expect(accountant?.permissions).toEqual(expect.arrayContaining([
      "accounting.view",
      "reports.financial.view",
      "reports.export",
      "cash_sessions.view_all",
      "invoices.view",
      "payments.view",
      "expenses.manage",
      "reconciliation.manage",
    ]));
    expect(accountant?.permissions).not.toEqual(expect.arrayContaining([
      "payments.refund",
      "payments.reverse",
      "invoices.correct",
      "cash_sessions.reopen",
      "users.manage",
      "platform.manage",
    ]));
  });

  it("réunit les droits de réservation, réception et caisse pour le Réceptionniste", () => {
    const receptionist = roleTemplates.find((role) => role.code === "RECEPTIONIST");
    expect(receptionist?.permissions).toEqual(expect.arrayContaining([
      "reservations.create",
      "reservations.update",
      "stays.checkin",
      "stays.extend",
      "cash_sessions.open_own",
      "payments.collect",
    ]));
    expect(receptionist?.permissions).not.toEqual(expect.arrayContaining([
      "accounting.view",
      "reports.financial.view",
      "payments.refund",
      "invoices.correct",
    ]));
  });

  it("réserve les rapports de service partagés à la réception et au propriétaire", () => {
    for (const code of ["RECEPTIONIST", "OWNER"]) {
      expect(roleTemplates.find((role) => role.code === code)?.permissions).toContain("shift_reports.view");
    }
    expect(roleTemplates.find((role) => role.code === "HOTEL_ADMIN")?.permissions).not.toContain("shift_reports.view");
  });

  it("donne à l’Administrateur Hôtel un socle minimal et des permissions déléguées par compte", () => {
    const admin = roleTemplates.find((role) => role.code === "HOTEL_ADMIN");
    expect(admin?.permissions).toEqual(["dashboard.view", "rooms.view"]);
    expect(admin?.permissions).not.toContain("users.manage");
    expect(admin?.permissions).not.toContain("roles.assign");
    expect(admin?.permissions).not.toContain("payments.collect");
  });

  it("ne contient aucune permission dupliquée dans le catalogue", () => {
    expect(new Set(allPermissions).size).toBe(allPermissions.length);
  });

  it("désactive les permissions des modules coupés sans modifier les autres groupes", () => {
    const permissions = permissionsWithEnabledFeatures(
      ["reservations.view", "payments.collect", "rooms.view", "dashboard.view", "platform.manage"],
      new Set(["RESERVATIONS", "CASHIER_OPERATIONS", "FOUNDATION", "PLATFORM"]),
    );

    expect(permissions).toEqual(["rooms.view", "dashboard.view", "platform.manage"]);
    expect(permissionsWithEnabledFeatures(["rooms.view"], new Set(["ROOMS"]))).toEqual([]);
  });
});
