/**
 * "Honest" jump support: write the minimum amount of state into a
 * JourneyContext so that traversing from the Plan's start reaches a target
 * waypoint.
 *
 * This intentionally does NOT bypass route conditions; it asks the Plan
 * itself which waypoints lie on the path to the target and then merges any
 * data the user has supplied (typically via a preset) so the conditions
 * evaluate truthfully.
 */

/**
 * Apply preset data into a JourneyContext, clearing any prior validation
 * errors for the waypoints touched.
 *
 * @param {object} journeyContext A CASA JourneyContext instance
 * @param {Record<string, Record<string, unknown>>} data
 */
export function applyPresetData(journeyContext, data) {
  for (const [waypoint, fields] of Object.entries(data ?? {})) {
    journeyContext.setDataForPage(waypoint, { ...fields });
    if (typeof journeyContext.clearValidationErrorsForPage === "function") {
      journeyContext.clearValidationErrorsForPage(waypoint);
    }
  }
}

/**
 * Walk the Plan from the first waypoint towards `target` using the live
 * JourneyContext, returning the path actually traversable right now.
 *
 * Used to power the "traversed so far" highlight in the journey graph.
 *
 * @param {object} plan A CASA Plan instance
 * @param {object} journeyContext
 * @returns {string[]}
 */
export function traversed(plan, journeyContext) {
  if (!plan || typeof plan.traverse !== "function") return [];
  try {
    return plan.traverse(journeyContext);
  } catch {
    return [];
  }
}
