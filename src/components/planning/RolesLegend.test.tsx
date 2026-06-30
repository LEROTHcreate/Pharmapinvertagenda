// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RolesLegend } from "./RolesLegend";
import { STATUS_LABELS, type EmployeeDTO } from "@/types";
import type { EmployeeStatus } from "@prisma/client";

afterEach(cleanup);

let seq = 0;
function emp(status: EmployeeStatus): EmployeeDTO {
  seq += 1;
  return {
    id: `e${seq}`,
    firstName: "Test",
    lastName: `N${seq}`,
    status,
    weeklyHours: 35,
    displayColor: "#8b5cf6",
    displayOrder: seq,
  };
}

describe("RolesLegend", () => {
  it("ne rend rien quand l'équipe est vide", () => {
    const { container } = render(<RolesLegend employees={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche un libellé + effectif par statut présent", () => {
    render(
      <RolesLegend
        employees={[emp("PHARMACIEN"), emp("PHARMACIEN"), emp("PREPARATEUR")]}
      />
    );
    // Les libellés des deux statuts sont rendus
    expect(screen.getByText(STATUS_LABELS.PHARMACIEN)).toBeInTheDocument();
    expect(screen.getByText(STATUS_LABELS.PREPARATEUR)).toBeInTheDocument();
    // Effectifs : 2 pharmaciens, 1 préparateur
    expect(screen.getByText("· 2")).toBeInTheDocument();
    expect(screen.getByText("· 1")).toBeInTheDocument();
  });

  it("trie les rôles par effectif décroissant", () => {
    render(
      <RolesLegend
        employees={[
          emp("ETUDIANT"),
          emp("PHARMACIEN"),
          emp("PHARMACIEN"),
          emp("PHARMACIEN"),
        ]}
      />
    );
    const labels = screen
      .getAllByText(
        (_, el) =>
          el?.tagName === "SPAN" &&
          (el.textContent === `${STATUS_LABELS.PHARMACIEN}· 3` ||
            el.textContent === `${STATUS_LABELS.ETUDIANT}· 1`)
      )
      .map((el) => el.textContent);
    // Le 1er rôle affiché est le plus nombreux (pharmacien ×3).
    expect(labels[0]).toContain(STATUS_LABELS.PHARMACIEN);
  });
});
