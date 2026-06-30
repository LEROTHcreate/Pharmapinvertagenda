import { describe, expect, it } from "vitest";
import {
  type AppRole,
  assignableRoles,
  canAccessPayroll,
  canApplyTemplates,
  canApproveUsers,
  canEditPlanning,
  canEditSettings,
  canManageTeam,
  canManageUser,
  canTransferOwnership,
  canValidateAbsences,
  canViewTeamPlanning,
  isCreator,
} from "./permissions";

const ALL: AppRole[] = ["CREATEUR", "ADMIN", "MANAGEUR", "COLLABORATEUR"];

describe("permissions RBAC (spec rbac-4-roles)", () => {
  it("planning : manageur+ éditent, collaborateur non", () => {
    expect(ALL.filter(canEditPlanning)).toEqual(["CREATEUR", "ADMIN", "MANAGEUR"]);
    expect(ALL.filter(canApplyTemplates)).toEqual(["CREATEUR", "ADMIN", "MANAGEUR"]);
    expect(ALL.filter(canManageTeam)).toEqual(["CREATEUR", "ADMIN", "MANAGEUR"]);
  });

  it("titulaire+ uniquement : absences, users, paie, paramètres", () => {
    const titulairePlus = ["CREATEUR", "ADMIN"];
    expect(ALL.filter(canValidateAbsences)).toEqual(titulairePlus);
    expect(ALL.filter(canApproveUsers)).toEqual(titulairePlus);
    expect(ALL.filter(canAccessPayroll)).toEqual(titulairePlus);
    expect(ALL.filter(canEditSettings)).toEqual(titulairePlus);
  });

  it("le manageur ne valide PAS les absences (décision validée)", () => {
    expect(canValidateAbsences("MANAGEUR")).toBe(false);
    expect(canAccessPayroll("MANAGEUR")).toBe(false);
    expect(canApproveUsers("MANAGEUR")).toBe(false);
  });

  it("tout le monde voit le planning équipe (collaborateur en lecture)", () => {
    expect(ALL.every(canViewTeamPlanning)).toBe(true);
  });

  it("le créateur est intouchable", () => {
    for (const actor of ALL) {
      expect(canManageUser(actor, "CREATEUR")).toBe(false);
    }
    expect(isCreator("CREATEUR")).toBe(true);
  });

  it("hiérarchie : un titulaire ne peut pas rétrograder un autre titulaire", () => {
    expect(canManageUser("ADMIN", "ADMIN")).toBe(false);
    expect(canManageUser("CREATEUR", "ADMIN")).toBe(true); // seul le créateur le peut
    expect(canManageUser("ADMIN", "MANAGEUR")).toBe(true);
    expect(canManageUser("ADMIN", "COLLABORATEUR")).toBe(true);
  });

  it("manageur / collaborateur ne gèrent personne", () => {
    for (const target of ALL) {
      expect(canManageUser("MANAGEUR", target)).toBe(false);
      expect(canManageUser("COLLABORATEUR", target)).toBe(false);
    }
  });

  it("transfert de créateur : réservé au créateur", () => {
    expect(ALL.filter(canTransferOwnership)).toEqual(["CREATEUR"]);
  });

  it("attribution de rôle : jamais CREATEUR ; titulaire+ peut attribuer le reste", () => {
    expect(assignableRoles("CREATEUR")).not.toContain("CREATEUR");
    expect(assignableRoles("ADMIN")).toEqual(["ADMIN", "MANAGEUR", "COLLABORATEUR"]);
    expect(assignableRoles("MANAGEUR")).toEqual([]);
    expect(assignableRoles("COLLABORATEUR")).toEqual([]);
  });
});
