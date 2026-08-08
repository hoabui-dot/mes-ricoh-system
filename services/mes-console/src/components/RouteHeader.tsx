import React from "react";
import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "@mom-platform/i18n-ui-shared";

type Crumb = { labelKey: string; href?: string; label?: string };

function businessCrumbLabelKey(labelKey: string) {
  if (labelKey === "nav.masterDataTier1") return "nav.productDefinition";
  if (labelKey === "nav.masterDataTier2")
    return "nav.plantStructureAndResources";
  return labelKey;
}

function routeCrumbs(pathname: string): Crumb[] {
  const normalized = pathname.replace(/^\/console\/mes/, "") || "/work-orders";
  if (normalized === "/work-orders")
    return [{ labelKey: "nav.operations" }, { labelKey: "nav.workOrders" }];
  if (normalized === "/work-orders/new")
    return [
      { labelKey: "nav.operations" },
      { labelKey: "nav.workOrders", href: "/work-orders" },
      { labelKey: "woCreate.title" },
    ];
  if (normalized.startsWith("/work-orders/"))
    return [
      { labelKey: "nav.operations" },
      { labelKey: "nav.workOrders", href: "/work-orders" },
      { labelKey: "woDetail.backToList" },
      { labelKey: "common.detail" },
    ];
  if (
    normalized.startsWith("/master-data/items") ||
    normalized.startsWith("/items")
  )
    return [{ labelKey: "nav.productDefinition" }, { labelKey: "nav.items" }];
  if (
    normalized.startsWith("/master-data/mboms") ||
    normalized.startsWith("/mboms")
  )
    return [{ labelKey: "nav.productDefinition" }, { labelKey: "nav.mbom" }];
  if (
    normalized.startsWith("/master-data/routings") ||
    normalized.startsWith("/routings")
  )
    return [{ labelKey: "nav.productDefinition" }, { labelKey: "nav.routing" }];
  if (
    normalized.startsWith("/master-data/production-versions") ||
    normalized.startsWith("/production-versions")
  )
    return [
      { labelKey: "nav.productDefinition" },
      { labelKey: "nav.productionVersion" },
    ];
  if (
    normalized === "/employees" ||
    normalized === "/shifts" ||
    normalized === "/work-calendar"
  )
    return [
      { labelKey: "nav.labor" },
      {
        labelKey:
          normalized === "/employees"
            ? "nav.employees"
            : normalized === "/shifts"
              ? "nav.shifts"
              : "nav.workCalendar",
      },
    ];
  if (
    normalized === "/master-data/work-centers" ||
    normalized === "/work-centers"
  )
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "nav.workCenters" },
    ];
  if (normalized.startsWith("/master-data/work-centers/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "nav.workCenters", href: "/master-data/work-centers" },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/equipment" || normalized === "/equipment")
    return [{ labelKey: "nav.masterDataTier2" }, { labelKey: "nav.equipment" }];
  if (normalized.startsWith("/master-data/equipment/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "nav.equipment", href: "/master-data/equipment" },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/workstations")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.workstations" },
    ];
  if (normalized.startsWith("/master-data/workstations/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.workstations",
        href: "/master-data/workstations",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/print-stations")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "nav.printStations" },
    ];
  if (normalized === "/master-data/production-areas")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.productionAreas" },
    ];
  if (normalized.startsWith("/master-data/production-areas/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.productionAreas",
        href: "/master-data/production-areas",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/production-lines")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.productionLines" },
    ];
  if (normalized.startsWith("/master-data/production-lines/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.productionLines",
        href: "/master-data/production-lines",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/factories")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.factories" },
    ];
  if (normalized.startsWith("/master-data/factories/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.factories",
        href: "/master-data/factories",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/shopfloors")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.shopfloors" },
    ];
  if (normalized.startsWith("/master-data/shopfloors/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.shopfloors",
        href: "/master-data/shopfloors",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/machines")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.machines" },
    ];
  if (normalized.startsWith("/master-data/machines/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.machines",
        href: "/master-data/machines",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/resource-assignments")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.assignments" },
    ];
  if (normalized.startsWith("/master-data/resource-assignments/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.assignments",
        href: "/master-data/resource-assignments",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/resource-capabilities")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.capabilities" },
    ];
  if (normalized.startsWith("/master-data/resource-capabilities/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.capabilities",
        href: "/master-data/resource-capabilities",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/resource-calendars")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.calendars" },
    ];
  if (normalized.startsWith("/master-data/resource-calendars/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.calendars",
        href: "/master-data/resource-calendars",
      },
      { labelKey: "common.detail" },
    ];
  if (normalized === "/master-data/operation-skill-requirements")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "resourceFoundation.operationSkillRequirements" },
    ];
  if (normalized === "/master-data/operations")
    return [
      { labelKey: "nav.productDefinition" },
      { labelKey: "operationCatalog.title" },
    ];
  if (normalized.startsWith("/master-data/operations/"))
    return [
      { labelKey: "nav.productDefinition" },
      { labelKey: "operationCatalog.title", href: "/master-data/operations" },
      { labelKey: "common.detail" },
    ];
  if (normalized.startsWith("/master-data/operation-skill-requirements/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "resourceFoundation.operationSkillRequirements",
        href: "/master-data/operation-skill-requirements",
      },
      { labelKey: "common.detail" },
    ];
  if (
    normalized === "/master-data/production-standards" ||
    normalized === "/production-standards"
  )
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "nav.productionStandards" },
    ];
  if (normalized.startsWith("/master-data/production-standards/"))
    return [
      { labelKey: "nav.masterDataTier2" },
      {
        labelKey: "nav.productionStandards",
        href: "/master-data/production-standards",
      },
      { labelKey: "common.detail" },
    ];
  if (
    normalized === "/master-data/reason-codes" ||
    normalized === "/reason-codes"
  )
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "nav.reasonCodes" },
    ];
  if (
    normalized === "/master-data/skills" ||
    normalized.startsWith("/master-data/skills/") ||
    normalized === "/skills"
  )
    return [{ labelKey: "nav.masterDataTier2" }, { labelKey: "nav.skills" }];
  if (normalized === "/i18n-review")
    return [
      { labelKey: "nav.masterDataTier2" },
      { labelKey: "nav.i18nReview" },
    ];
  return [{ labelKey: "nav.operations" }, { labelKey: "common.notFound" }];
}

export const RouteHeader: React.FC = () => {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const crumbs = routeCrumbs(pathname);
  const crumbLabel = (crumb: Crumb) =>
    crumb.label || t(businessCrumbLabelKey(crumb.labelKey));

  return (
    <header
      className="mes-route-header"
      aria-label={t("common.pageNavigation")}
    >
      <nav aria-label={t("common.breadcrumbs")}>
        <ol className="mes-breadcrumbs">
          <li>
            <Link
              to="/work-orders"
              className="mes-breadcrumb-link"
              aria-label={t("common.home")}
            >
              <Home className="h-3.5 w-3.5" />
              <span>{t("common.home")}</span>
            </Link>
          </li>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.labelKey}-${index}`}>
              <li aria-hidden="true">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </li>
              <li>
                {crumb.href && index < crumbs.length - 1 ? (
                  <Link to={crumb.href} className="mes-breadcrumb-link">
                    {crumbLabel(crumb)}
                  </Link>
                ) : (
                  <span
                    className={
                      index === crumbs.length - 1
                        ? "mes-breadcrumb-current"
                        : "mes-breadcrumb-section"
                    }
                  >
                    {crumbLabel(crumb)}
                  </span>
                )}
              </li>
            </React.Fragment>
          ))}
        </ol>
      </nav>
    </header>
  );
};
