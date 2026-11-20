/**
 * LeafIndex.ts — registers the TrafficInsight LEAF scenarios.
 * One scenario per done criterion in devpost/design-brief.md; ids match the
 * criteria (C1-C14). Attached to the root SceneObject "LeafIndex".
 */

import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";
import { PlanOfficeTripScenario } from "./PlanOfficeTripScenario";
import { RideHidesLensScenario } from "./RideHidesLensScenario";
import { CrashAlertScenario } from "./CrashAlertScenario";
import { RerouteScenario } from "./RerouteScenario";
import { RainRaincoatScenario } from "./RainRaincoatScenario";
import { TableOnlyWhilePlanningScenario } from "./TableOnlyWhilePlanningScenario";
import { MapPlacementScenario } from "./MapPlacementScenario";
import { ProgressMarksScenario } from "./ProgressMarksScenario";
import { RoadViewScenario } from "./RoadViewScenario";
import { JourneyContextScenario } from "./JourneyContextScenario";
import { GlanceLookDownScenario } from "./GlanceLookDownScenario";
import { GlanceViewingAngleScenario } from "./GlanceViewingAngleScenario";
import { WhereAmIScenario } from "./WhereAmIScenario";
import { GlancePriorityScenario } from "./GlancePriorityScenario";

@component
export class LeafIndex extends BaseScriptComponent {
    @scenariosIndex
    static scenariosIndex: ScenarioMetadata[] = [
        { id: "C1", typename: PlanOfficeTripScenario.getTypeName() },
        { id: "C2", typename: RideHidesLensScenario.getTypeName() },
        { id: "C3", typename: CrashAlertScenario.getTypeName() },
        { id: "C4", typename: RerouteScenario.getTypeName() },
        {
            id: "C5",
            typename: RainRaincoatScenario.getTypeName(),
            parameters: {
                resolve: { default: "both", type: "enum", options: ["both", "proceed", "raincoatOn"] },
            },
        },
        { id: "C6", typename: TableOnlyWhilePlanningScenario.getTypeName() },
        { id: "C7", typename: MapPlacementScenario.getTypeName() },
        { id: "C8", typename: ProgressMarksScenario.getTypeName() },
        { id: "C9", typename: RoadViewScenario.getTypeName() },
        { id: "C10", typename: JourneyContextScenario.getTypeName() },
        { id: "C11", typename: GlanceLookDownScenario.getTypeName() },
        { id: "C12", typename: GlanceViewingAngleScenario.getTypeName() },
        { id: "C13", typename: WhereAmIScenario.getTypeName() },
        { id: "C14", typename: GlancePriorityScenario.getTypeName() },
    ];
}
